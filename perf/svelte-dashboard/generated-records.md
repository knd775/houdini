# Generated records: lower memory and faster updates, no startup win

The [follow-up CPU profile](./projection-profile.md) measures construction costs
and removes redundant selection bookkeeping from the default runtime.

The prototype generates fixed record classes from GraphQL selection metadata,
using private Svelte rune fields and shared getters. It preserves `Query.data`,
readonly own properties, plain object prototypes, serialization, cache identity
and the existing update pipeline. All 1,139 selected records on the large page
used generated classes across nine layouts. Unmatched shapes retain the original
proxy implementation.

The experiment stays under `perf/`; the shipping runtime is unchanged. Generated
records improve filtering and several cache-update workloads, but do not meet
the startup goal. They add compiler integration and generated-code maintenance
without a consistent mount improvement. See the [implementation and reproduction
instructions](./generated-records/README.md).

## Measurement design

Early runs in separate builds showed substantial variation in the unchanged store
control. The main comparison therefore loads both runtime implementations into
the same browser build and rotates their order. Both use the same cache, client
pipeline, query selections and Svelte components. The original runtime modules
are not patched in this paired mode.

The filter-focused run uses 24 trials per mode, each with eight warm-up updates
and 20 measured updates. It also measures 12 fresh pages per mode. Fresh-page
timers start after modules load and exclude downloads, module evaluation, layout
and paint. The full workload run uses six trials per workload at both page sizes,
giving 54 mounts per mode and size. All normal timing runs use minified production
builds with allocation sampling disabled.

Times below are medians in milliseconds unless stated otherwise.

## Startup and filtering

Same-run comparison on 432 tasks, 1,562 components and 1,535 application effects:

| Measurement | Stores | Current fields | Generated records | Native Svelte state |
| --- | ---: | ---: | ---: | ---: |
| Fresh-page mount | 81.780 | 92.250 | 95.195 | 91.685 |
| Fresh-page preparation + mount + cache population | 139.430 | 148.730 | 152.240 | 148.325 |
| Warm mount in filter-focused run | 28.825 | 37.685 | 38.715 | 45.600 |
| Full-page filter update | 15.040 | 17.640 | 16.305 | 18.515 |
| Filter hides cards | 1.380 | 1.940 | 1.880 | 2.210 |
| Filter restores cards | 16.510 | 19.405 | 18.255 | 20.175 |

Generated records mount about 3% slower than current fields in this fresh-page
run and remain about 16% slower than stores. Filtering improves about 8%; the
generated version had a lower mean filter time in 21 of the 24 paired trials.
Filtering alternates hiding cards and restoring them, so the separate phase rows
are more informative than the pooled median alone.

Warm mount remains sensitive to the surrounding workload. Across the full run,
current/generated mounts were 12.375/12.595 ms for 144 tasks and 38.165/36.860 ms
for 432 tasks. These mixed results do not establish a consistent startup win.

## Allocation and filtering without DOM work

Five fresh pages per mode and phase. Allocation samples use a 16 KiB interval and
include objects collected during the phase. Retained values are JavaScript heap
deltas after forced collection, excluding DOM/renderer memory. Probe pages are
separate from the unprofiled timing trials above.

| Probe | Current fields | Generated records |
| --- | ---: | ---: |
| Projection retained bytes | 935,320 | 730,660 |
| Projection sampled allocated bytes | 1,673,652 | 1,464,868 |
| Projection time with sampling enabled | 10.485 ms | 13.270 ms |
| Mounted page retained bytes | 5,207,272 | 5,020,704 |
| Sampled allocations per full-page filter update | 1,749,446 | 1,823,756 |
| Title scan and reactive effect, without DOM changes | 0.131 ms | 0.081 ms |

The projected results retain about 22% less memory. The reduction for the whole
mounted JavaScript page is about 4%, and filtering allocations did not improve.
Allocation sampling is an estimate; the small differences should not be read as
exact allocation accounting.

The synthetic title scan improves about 38%, but saves only about 0.05 ms per
scan. It uses one effect that scans every project's task titles. The dashboard
has additional derivations and component lifecycles, so this is a diagnostic,
not a substitute for the full filter workload. Restoring cards dominates that
workload's measured time.

This design removes proxy reads and separate `Field` objects. It still initializes
a signal for each field and installs readonly own-property descriptors on every
record. Lower allocation did not translate into faster construction in the
profiled probe. Identifying the exact construction costs would need a CPU profile;
the measurements here do not isolate descriptor installation from signal setup.

## Cache updates

Same-run comparison on the 432-task page, six trials and 120 measured updates per
workload and mode:

| Update | Stores | Current fields | Generated records |
| --- | ---: | ---: | ---: |
| Title | 6.775 | 0.070 | 0.070 |
| Estimate and derived totals | 6.510 | 0.645 | 0.455 |
| Status moving a card | 6.800 | 0.865 | 0.675 |
| Shared user | 7.810 | 0.455 | 0.380 |
| Batch of 40 estimates | 7.125 | 1.440 | 1.165 |
| Reorder | 7.095 | 5.650 | 5.060 |
| Insert/remove | 7.165 | 5.590 | 4.925 |
| Local filter | 15.575 | 18.005 | 17.010 |
| Optimistic estimate and rollback | 14.120 | 1.445 | 0.985 |

The generated version retains field isolation and improves several workloads
that read many fields. Estimate updates improve about 29%, for example. Single
title edits are already small and show no useful difference at this resolution.

## Validation and limits

- 28 unit tests passed, including the existing projection, field-index and store
  tests plus five generator-specific checks.
- All 18 browser regressions and public type checks passed with generated records
  enabled, including SSR/hydration, ownership cleanup, fragments, subscriptions,
  snapshots, custom scalars, readonly reflection and null recovery.
- All nine dashboard workloads matched the store DOM in current and generated
  modes. The mixed sequence also passed, including hidden-card edits and
  optimistic checkpoints. Scalar updates retained zero query-root reads.

The prototype consumes benchmark selections at build time. It is not integrated
into Houdini's actual GraphQL compiler and has not been validated against every
generated application shape. No new package release or full repository test run
was performed for this experiment.

In separate single-runtime builds, generation added 8,576 minified JavaScript
bytes and 1,419 gzip bytes for nine layouts. These measurements include the
benchmark adapter and retained generic fallback. The paired build additionally
contains duplicate runtime modules and is not a production bundle-size estimate.

## Raw reports

- Paired startup, filtering, native state and allocation probes: `results-generated-paired.json`
- Paired full workloads at both sizes: `results-generated-paired-full.json`
- Initial control with allocation probes: `results-generated-control.json`
- Initial generated run with allocation probes: `results-generated-records.json`
- Repeated control: `results-generated-control-repeat.json`
- Single-runtime generated full run and bundle size: `results-generated-full.json`
- Single-runtime control full run and bundle size: `results-generated-control-full.json`
