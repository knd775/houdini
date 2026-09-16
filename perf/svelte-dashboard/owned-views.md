# Owned result views: profiling and integration follow-up

This report predates the `experimentalFieldReactivity` opt-in. The SvelteKit
integration app now keeps legacy defaults; the focused browser suite tests both
runtime modes, including experimental SSR and hydration.

The current runtime owns one reactive data tree. It uses that tree's private
field values when comparing incoming results, removing the second full snapshot
and its traversal. Records use one readonly proxy with a shared handler; arrays
remain frozen native arrays. Public reads track Svelte signals. Internal reads
bypass the proxy and dependency tracking.

The field index uses fresh selection metadata on every full result, even when
record views survive reconciliation. Incoming query snapshots remain untouched.
Standard Dates retain their published timestamps separately, so mutating a
returned Date cannot conceal a later cache update. Custom scalar classes remain
opaque values.

## Profiling

The reviewed baseline was profiled with 30 large-page lifecycles and 30 filtering
updates per API, using Chromium's sampling profiler and an unminified production
build. Record construction, field reads and allocation were visible costs.
Garbage collection accounted for about 470 ms across the field-mode lifecycles
versus 230 ms with stores. These lifecycle profiles include fixture creation and
teardown; they are not measurements of mount time alone.

Binding a separate getter for each field increased mount and filter times, so
that experiment was discarded. Removing the extra snapshot initially made list
updates slower because comparisons went through proxy reflection. Reading the
private field values fixed that regression.

## Production measurements

The full workload runs use five trials, 20 measured updates after eight warm-up
updates, and 45 page mounts per API and size. Times below are medians in ms.

| Full workload run | Reviewed stores | Reviewed fields | Current stores | Current fields |
| --- | ---: | ---: | ---: | ---: |
| Mount, 144 tasks | 9.770 | 13.910 | 9.920 | 12.310 |
| Mount, 432 tasks | 27.950 | 40.580 | 29.365 | 39.325 |
| Filter, 432 tasks | 14.335 | 17.015 | 15.840 | 17.940 |
| Title edit, 432 tasks | 6.825 | 0.065 | 7.285 | 0.080 |
| Estimate edit, 432 tasks | 6.785 | 0.725 | 6.520 | 0.655 |
| Reorder, 432 tasks | 7.055 | 5.465 | 7.365 | 5.550 |
| Insert/remove, 432 tasks | 7.795 | 5.935 | 7.765 | 5.950 |

Mount improves about 12% on the medium page and 3% on the large page in these
full runs. Separate runs have different store controls and broad timing tails;
small differences should not be treated as reliable improvements.

A separate filter-focused run rotates stores, current fields and native Svelte
state across 15 trials on the same 432-task page:

| Measurement | Stores | Current fields | Native Svelte state |
| --- | ---: | ---: | ---: |
| Warm mount | 30.615 | 32.475 | 47.095 |
| Filter | 14.645 | 17.005 | 17.635 |

Warm mount varies considerably with the surrounding workload. This run supports
the lower-allocation implementation, but does not establish a universal 20%
mount improvement. Filtering remains about 16% slower than stores. Native state
has similar filtering overhead, which suggests dependency tracking and component
remounting account for much of the remaining gap.

## First mount in fresh pages

Nine fresh pages per API, rotating execution order. Timers start after the page
has loaded its modules. They include cache population, preparation of three
queries and mounting the dashboard, excluding downloads, module evaluation,
layout and paint.

| Fresh-page measurement | Stores | Current fields | Native Svelte state |
| --- | ---: | ---: | ---: |
| Mount | 76.470 | 89.605 | 86.795 |
| Total fixture + preparation + mount | 131.640 | 144.840 | 141.955 |

Direct fields still have a first-mount cost: about 17% for mounting and 10% for
the measured application startup. The target of beating stores on every workload
has not been met.

## Correctness and generated applications

All nine dashboard workloads and the mixed sequence produce matching DOM output.
Scalar writes still avoid reading the query root and preserve unrelated effects.
The runtime checks cover source ownership, readonly reflection, same-object
emissions, Date mutation, custom scalar classes, list identity and null recovery.

The SvelteKit integration fixtures now read direct fields for SSR, cursor
pagination, fragments with Date scalars, and one of the two concurrent
subscriptions. Other fixtures continue exercising legacy store syntax.

Validation passed:

- 270 runtime tests, with five existing todos, and 18 focused browser tests.
- Public type checks and focused lint checks.
- Package compilation for Houdini, houdini-core and houdini-svelte, including
  native generator binaries and WASM.
- The generated SvelteKit production build and 52 selected integration tests
  covering pagination, SSR, subscriptions, custom scalars, plural fragments and
  refetchable fragments.
- Eight Svelte 5 integration tests after correcting the page-info test to visit
  the direct-field route and adding a JavaScript-disabled SSR assertion.

The eight-test rerun overlaps the 52-test run, for 53 distinct integration tests.
The entire repository test suite was not run. The Playwright configuration now
selects the application tsconfig explicitly and accepts `CHROMIUM_EXECUTABLE`.

## Reproduce

```sh
pnpm bench:svelte:dashboard
NATIVE_STATE=1 PROJECTS=18 TRIALS=15 COLD_TRIALS=9 pnpm bench:svelte:dashboard
PROFILE=/tmp/dashboard-profiles VERIFY_ONLY=1 pnpm bench:svelte:dashboard
pnpm --filter e2e-kit exec playwright test 'svelte5-runes|subscriptions|pagination|stores/ssr|stores/mutation-scalars|plugin/query/scalars|refetchable-fragment|plural-fragment'
```

Use `CHROMIUM_EXECUTABLE` to select an installed browser and `OUTPUT` to choose
the report path. Raw reports retain every sample:

- Reviewed full run: `results-reviewed.json`
- Reviewed native-state control: `results-reviewed-native.json`
- Current full run: `results-owned-views.json`
- Current native-state and fresh-page measurements: `results-owned-views-native.json`
