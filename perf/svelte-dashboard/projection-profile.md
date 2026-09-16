# Initial projection profile

This pass keeps two small runtime changes: reuse the cache's resolved field
selection when building the reactive index, and avoid repeating scalar/container
checks during projection. The public API remains `Query.data`.

The result is less projection work and about 13% less retained projection memory.
It does not establish a full-page startup or filtering improvement. The larger
startup gap against stores remains.

## What the CPU profiles show

The probe prepares three real queries, then profiles their first direct data
reads on a fresh page. Cache population, query preparation, component creation,
DOM work and cleanup happen outside the profile. The large fixture contains
432 tasks and 1,139 selected record occurrences. Each implementation gets 40
fresh pages, with order rotated each trial.

The first comparison uses the existing proxy implementation and the earlier
generated-record prototype in one build. Median projection times under CPU
sampling were 8.000 ms and 12.190 ms respectively. The current implementation's
329.581 ms of sampled projection time across all trials breaks down as follows:

| Self-time frames | Sampled ms | Share |
| --- | ---: | ---: |
| Record/array construction, `container` | 70.206 | 21.3% |
| Recursive `project` and its child-read callback | 68.737 | 20.9% |
| Field index registration and field selection | 47.332 | 14.4% |
| Cache identity registration and lookup | 20.918 | 6.3% |
| Named `Field`, `source` and `state` frames | 17.452 | 5.3% |
| Other frames, including result metadata and Svelte publication | 104.936 | 31.8% |

These are non-overlapping sampled self times, not exact accounting for conceptual
operations. V8 can inline signal construction into record construction, for
example. The signal row does not mean signals cost only 5.3% overall. It does
show that there is useful work to remove outside signal creation.

Generated records spend 69.249 ms in their factory and 85.145 ms in the two most
common record constructors alone. Their shape lookup adds another 19.675 ms.
Generating record classes did not remove enough construction work to win this
probe. Individual signal initialization and descriptor-installation costs cannot
be separated reliably from these samples.

## Changes retained

Cache reads already resolve abstract GraphQL selections and attach the concrete
field map to each record. The field index was passing that fresh wrapper through
`getFieldsForType` again. That helper creates a memoization map per selection,
so each record allocated a map to cache an answer it already had.

The index now uses the attached fields directly. It retains the existing resolver
for metadata that still contains abstract fields. This also preserves masked
`__typename` behavior: the cache has already selected the correct concrete type.

Projection already knows when a value is not an array or plain object. It now
returns opaque scalars directly and copies ordinary Dates once, keeping the
canonical published timestamp used to detect updates after a consumer mutates
a returned Date. Date subclasses retain their existing opaque-scalar behavior.

No compiler integration, generated classes, new signal abstraction or additional
public API is needed.

## Results

An additional paired CPU-profile run compares the final runtime with the previous
implementation restored in benchmark-only virtual modules. Across 40 fresh pages
per mode, median projection falls from **7.765 to 6.815 ms**, about 12%. Total
sampled projection time falls from 313.847 to 273.569 ms. The redundant selection
resolver and scalar capture frames disappear from the optimized projection.

The minified, paired candidate run gives the following results. Normal timing
trials run without CPU or allocation sampling. Memory probes use separate pages.

| Measurement | Before | Retained candidate |
| --- | ---: | ---: |
| Projection retained JS bytes | 935,360 | 810,324 |
| Mounted page retained JS bytes | 5,206,280 | 5,081,404 |
| Fresh-page mount, ms | 94.750 | 97.080 |
| Warm mount in filter-focused run, ms | 40.555 | 36.695 |
| Full-page filter update, ms | 17.660 | 17.765 |
| First title update in full workload run, ms | 0.250 | 0.225 |
| Steady title update, ms | 0.070 | 0.070 |
| Estimate update with derived totals, ms | 0.635 | 0.625 |

The retained-memory reduction is repeatable: separate single-runtime builds also
retain about 125 KB less after projection and after mount. That is about 13% of
projection memory and 2.4% of the complete mounted JavaScript heap. These figures
exclude DOM/renderer memory. Sampled allocated bytes are estimates; retained bytes
are heap deltas after forced collection.

Page timings do not support a startup claim. The paired candidate's fresh mount
is about 2.5% slower while its warm mount is faster. Separate builds move from
93.050 to 100.795 ms for fresh mounts, but unchanged store mounts also move from
79.445 to 85.375 ms and native Svelte state from 92.995 to 101.155 ms. The machine
is shared with other work, and the controls expose that variation. Paired builds
also have duplicate runtime classes and may warm differently. Neither comparison
establishes that this change improves whole-page startup.

Filtering remains effectively unchanged in the main paired run. The full-workload
run reports 17.750 to 16.975 ms, but the filter-focused run does not reproduce
that gain. Single-title updates preserve their existing advantage over stores,
which took 6.995 ms in the same full-workload run.

The filter-focused run uses 24 warm trials and 12 fresh pages per mode. The
single-runtime runs use 24 warm trials and 16 fresh pages. Each warm trial has
eight warm-up updates and 20 measured updates. The complete nine-workload run
uses six trials at both 144 and 432 tasks. Allocation probes use five fresh pages
per mode and phase. Fresh-page timings exclude download, module evaluation,
layout and paint.

## Other candidates

Ordinary objects for internal field storage reduced projection memory about 17%
but did not improve page startup or filtering. That candidate also needs special
handling for `__proto__` fields. It remains isolated in the benchmark.

Reusing resolved selections alone reduced projection memory about 13%. The
retained candidate combines that change with the scalar-path simplification.
The generated-record prototype also remains an experiment. Its earlier filtering
and memory gains did not establish a startup improvement.

## Validation

All nine dashboard workloads and the mixed sequence pass with the old and new
implementations. Scalar cache edits retain zero query-root reads. The added
regression covers aliased fields on a union with hidden IDs and `__typename`,
both during initial indexing and after rebuilding the index from fresh metadata.

The affected runtime suite passes 403 tests, with five existing todos. All 18
browser regressions and public type checks pass, including SSR/hydration,
subscription cleanup, fragments, snapshot ownership and custom scalar behavior.

## Reproduction

Profile the retained implementation against the pre-change baseline:

```sh
PROJECTION_VARIANT=baseline VERIFY_ONLY=1 PROFILE_TRIALS=40 \
  PROJECTION_PROFILE=/tmp/houdini-projection \
  OUTPUT=perf/projection-profile.json pnpm bench:svelte:dashboard
```

The directory contains individual Chrome `.cpuprofile` files, an aggregate
summary and the unminified JavaScript bundle needed to interpret frame locations.
The report also embeds the aggregate profile data. Profile builds disable
minification; their timings are diagnostic and should not be mixed with ordinary
production benchmark timings.

Compare the old and current runtime in a minified build:

```sh
PROJECTION_VARIANT=baseline NATIVE_STATE=1 PROJECTS=18 \
  TRIALS=24 COLD_TRIALS=12 PROBES=1 pnpm bench:svelte:dashboard
```

`fields` always means the current source. `baseline` restores the two old paths
in virtual runtime copies. `baseline-single` restores them in a separate build
without duplicate runtime modules. Historical reports below were recorded before
adopting the candidate, so their `fields` mode is the old implementation and
`resolved-leaves` is the retained candidate. Variant transforms check their source
anchors and fail if the relevant runtime changes.

## Raw reports

- Initial CPU profiles, proxy and generated records: `results-projection-profile.json`
- Final CPU profiles, optimized and previous runtime: `results-projection-profile-after.json`
- Paired retained candidate, startup, filtering and memory: `results-resolved-leaves.json`
- Paired retained candidate, all workloads: `results-resolved-leaves-full.json`
- Single-runtime baseline: `results-projection-single-before.json`
- Single-runtime candidate: `results-projection-single-after.json`
- Ordinary internal storage candidate: `results-plain-records.json`
- Resolved fields candidate: `results-resolved-fields.json`
