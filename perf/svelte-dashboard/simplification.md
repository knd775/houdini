# Simplifying the field-reactivity runtime

This pass removes implementation layers left over from earlier prototypes. The
public API remains `Query.data`, with the same readonly values and legacy store
subscriptions.

## Changes

- Store getters read a named field from `ResultState`'s reactive map. The internal
  result-envelope proxy, its reflection traps and duplicate write-rejection code
  are removed. Returned data and metadata containers still use readonly views.
- Reconciliation takes the owned current value and the incoming value, plus the
  record-key function. The separate previous-snapshot argument is removed. Every
  production caller already used the owned view as its previous state.
- Full results and scalar patches publish metadata through one loop. After a
  successful scalar patch, that loop skips the lazy `data` getter. It no longer
  creates a temporary metadata object or calls reconciliation on unchanged data.
- The scalar patch publisher reuses its existing field value when deciding
  whether to assign a replacement. Subscription counting also drops a redundant
  undefined fallback, and ownership comments now describe the actual lifecycle.

`state.svelte.ts` shrinks from 160 to 114 lines. The tests and benchmark adapters
now use the smaller internal interfaces, including the generated-record experiment.
The previous-snapshot prototype in `perf/svelte-reactivity` remains a historical
benchmark control with its own reconciliation implementation.

## Complexity retained

The regular and internal document subscriptions have different contracts. Regular
callbacks receive snapshots they can retain; field consumers can avoid reading
the whole query. Custom client hooks still materialize results and invalidate
field hints before transforming them.

The field index still validates and captures a complete scalar batch before
changing signals. Relationship changes, null propagation and unknown records
fall back to full reconciliation. Keyed reconciliation preserves records and DOM
identity through reorderings, including duplicate record occurrences.

Lifecycle guards handle synchronous first emissions, asynchronous client setup,
late callbacks and resuming after missed updates. Separate Date timestamps remain
necessary because consumers can call mutating methods on a returned Date.

These paths protect observable behavior. Combining them further would need a
specific replacement for those guarantees.

## Verification

- The runtime suite passes 404 distinct tests, with five existing todos. Two
  reconciliation test calls were corrected during the interface migration and
  their 14-test file was rerun successfully. The store ownership tests were also
  rerun after simplifying their counter.
- All 19 browser regressions and public type checks pass. The added regression
  verifies that metadata appearing and disappearing updates its reader without
  invalidating data consumers or replacing the data view.
- The experimental generated-record configuration passes all 30 tests, including
  its five generator-specific checks.
- Both dashboard runs pass all nine workloads and the mixed sequence. Scalar
  writes retain zero query-root reads. Unmount releases every cache subscription.

## Performance check

Separate minified production builds, six trials per workload and mode at both
144 and 432 tasks. Each trial uses eight warm-up updates and 20 measured updates.
Each size also has 12 fresh pages per mode. No other tests from this task ran
during either benchmark.

Representative large-page medians, in milliseconds:

| Measurement | Fields before | Fields after | Stores before | Stores after |
| --- | ---: | ---: | ---: | ---: |
| Fresh-page mount | 92.265 | 91.730 | 84.185 | 79.310 |
| Title edit | 0.070 | 0.065 | 6.775 | 6.590 |
| Estimate and derived totals | 0.610 | 0.615 | 6.830 | 6.710 |
| Reorder | 5.415 | 5.535 | 7.450 | 7.730 |
| Insert/remove | 5.510 | 5.290 | 7.605 | 7.215 |
| Local filter | 17.955 | 16.870 | 15.735 | 14.700 |

The unchanged store control also varies between runs. These measurements are a
regression check and do not establish a speedup. On the medium page, field mount
moves from 54.530 to 56.270 ms, while store mount moves from 50.910 to 50.645 ms.
The mixed results do not show a broad performance change. The existing startup
and filtering tradeoffs remain.

Fresh-page timers start after module loading and exclude download, module
evaluation, layout and paint. All raw samples and correctness diagnostics are
preserved in the `results-simplification-before.json` and
`results-simplification-after.json` reports.

Reproduce the current implementation:

```sh
TRIALS=6 COLD_TRIALS=12 pnpm bench:svelte:dashboard
```

## Follow-up cache metadata cleanup

The next pass tightens the contract between cache reads and Svelte projection.
The cache now attaches its resolved field map directly to record metadata.
This removes one selection-wrapper allocation per selected cache record, and
the field index consumes those fields without another type-resolution branch.
Abstract and loading selections remain the cache's responsibility, including
records whose typename is masked in the returned data.

Snapshot and reactive-view builders now use one metadata-copy function. It
copies the record ID, fields, variables and null-propagation flag together.
Copies keep independent flags, so marking one result cannot change another
result's fallback behavior. The metadata setter takes named properties instead
of five positional arguments. Cache messages and field updates also share one
`ChangedField` type.

The runtime suite passes 405 tests, with five existing todos. All 19 browser
tests and public type checks pass. The generated-record experiment passes
31 tests, and its adapter now uses the resolved field map. The added regression
checks that metadata copying preserves null-propagation flags without sharing
them between results.

Before and after production builds use the same benchmark settings as the first
pass: six trials per workload at 144 and 432 tasks, plus 12 fresh pages per mode
and size. Both runs pass all nine workloads and the mixed sequence. Scalar
writes still cause zero query-root reads, and unmount releases subscriptions.

Large-page medians in milliseconds:

| Measurement | Fields before | Fields after | Stores before | Stores after |
| --- | ---: | ---: | ---: | ---: |
| Fresh-page mount | 95.230 | 87.700 | 81.450 | 78.375 |
| Title edit | 0.070 | 0.065 | 6.895 | 6.550 |
| Estimate and derived totals | 0.670 | 0.595 | 6.920 | 6.425 |
| Reorder | 5.255 | 5.525 | 7.470 | 7.510 |
| Insert/remove | 5.875 | 5.555 | 8.490 | 7.410 |
| Local filter | 18.220 | 17.110 | 15.230 | 14.245 |

The medium-page field mount remains almost unchanged at 56.030 versus
55.950 ms. Store timings also move between runs, and both modes use the smaller
cache metadata. These measurements show broadly comparable performance, rather
than isolating a speedup from this cleanup. Startup and filtering still cost
more than ordinary stores. The code removes an allocation, but this pass does
not measure retained memory.

Raw results: `results-simplification2-before.json` and
`results-simplification2-after.json`.
