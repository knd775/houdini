# Field-level Svelte reactivity benchmarks

For a complete dashboard with multiple queries, components, effects, and derived
chains, see the [dashboard benchmark](../svelte-dashboard/README.md). It includes
initial mount, structural updates, and local filtering, which expose costs that
this single-field table workload does not measure.

Enable `experimentalFieldReactivity: true` in the Svelte plugin configuration to
use `Query.data`. Scalar cache notifications carry changed record/field pairs to
the store's internal Svelte state. Updating one field reads and patches that field
without reconstructing or comparing the query result. Existing stores remain
the default. The `runtime` benchmark explicitly opts into field-aware cache reads
and subscriptions; other modes use ordinary snapshots.

## Field reactivity findings

Median milliseconds per single-name cache write plus synchronous Svelte flush in
a production build:

| Rows | Cell calculation | Whole-query store | Snapshot prototype | Field state | Row subscriptions |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Plain name | 0.385 | 0.390 | 0.045 | 0.030 |
| 1,000 | Plain name | 2.760 | 2.515 | 0.055 | 0.035 |
| 5,000 | Plain name | 17.950 | 14.860 | 0.125 | 0.110 |
| 100 | Synthetic formatting | 1.805 | 0.285 | 0.055 | 0.035 |
| 1,000 | Synthetic formatting | 10.180 | 2.560 | 0.065 | 0.050 |
| 5,000 | Synthetic formatting | 85.460 | 16.665 | 0.140 | 0.135 |

For 1,000 plain rows, the field state path takes about 50 times less time than
the whole-query store in this workload. Mean cache time is 0.014 ms and mean
state-update time is 0.021 ms. At 5,000 rows these are 0.018 ms and 0.026 ms.
Flush time grows with the mounted application, but cache reading and patching no
longer walk the selected table on each scalar change.

One name update in 1,000 rows produced these diagnostic counts:

| Work per update | Whole-query store | Snapshot prototype | Field state | Row subscriptions |
| --- | ---: | ---: | ---: | ---: |
| Table list evaluations | 1 | 0 | 0 | 0 |
| Name derivations | 1,000 | 1 | 1 | 1 |
| Name effects | 1,000 | 1 | 1 | 1 |
| Email effects | 1,000 | 0 | 0 | 1 |
| Row mounts or unmounts | 0 | 0 | 0 | 0 |
| DOM mutations | 1 | 1 | 1 | 1 |

The store causes broad reactive work; keyed rows still preserve the DOM. The
field path avoids those extra calculations as well as the full cache read.
Row subscriptions remain slightly cheaper in these runs and require one cache
subscription per row. Direct query fields need no row-fragment API.

`results-fields.json` records aggregates, p95 values,
diagnostics, and the environment. There are three trials, ten warm-up updates
and thirty measured updates per trial, giving 90 samples per case. Synthetic
formatting is a 2,000-iteration string hash in each name derivation, intended to
show the cost of repeating a calculation across unchanged rows.

These are local measurements on Linux x64, Xeon E5-2680 v3, Node 24.19.0,
Svelte 5.56.2 and headless Chromium 153.0.8010.12, recorded September 15, 2026.
They do not establish speedups for every operation. Structural changes, null
propagation and resets still reconcile complete selections. Initialization,
index memory, network time, layout and paint are excluded.

## What is measured

- Store: the real Houdini cache emits whole query results into Houdini's
  `Writable`. A keyed table passes each row to a Svelte component.
- Reconciled: the original snapshot prototype reconciles whole query results
  into stable arrays and records.
- Runtime: the real cache emits lazy field notifications through a `Writable`
  into the production `ResultState` implementation. The component reads direct
  `.data` fields. This includes field indexing, scalar reads, private snapshots,
  readonly proxies, and Svelte subscription ownership.
- Fragments: one masked parent selection and one cache subscription per row
  feed individual stores. This models row-fragment subscription boundaries.

The runtime benchmark uses the same state implementation as `QueryStore`, but
does not include `DocumentStore` middleware or query setup. The browser suite
separately exercises the default client pipeline and asserts that a query's
scalar update reads only the changed record field, never the query root.
The fragment benchmark also omits generated helpers and middleware.

Each update changes one normalized record's name with `cache.write`, as a
mutation's cache write would. The row index changes deterministically. Network
requests and the mutation pipeline are excluded.

Cache timing includes writes and notification, with callback time subtracted.
Adapter timing includes store publication and state patching. Flush timing covers
`flushSync` and synchronous DOM changes, excluding layout and paint. It does not
measure a full browser frame or establish frame rates.

Diagnostics use counters and a `MutationObserver`. Timing runs disable counters
and leave diagnostic effects unsubscribed. Each trial mounts a fresh table and
cache, and mode order rotates across trials. Startup, teardown and memory are
excluded. Row subscriptions have additional setup cost; field state owns a
field index and reactive tree.

## Run

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm bench:svelte
```

Supply `CHROMIUM_EXECUTABLE` to use an existing browser. This checkout used:

```sh
CHROMIUM_EXECUTABLE=/home/ben/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell pnpm bench:svelte
```

A quick run keeps correctness assertions and reduces timing samples:

```sh
SIZES=100 WORK=0 TRIALS=1 UPDATES=5 WARMUP=2 pnpm bench:svelte
```

The recorded field run used `SIZES=100,1000,5000 WORK=0,2000 TRIALS=3 UPDATES=30`.
`SIZES` and `WORK` accept comma-separated values. `OUTPUT` overrides the raw JSON
path, which defaults to `perf/benchmark.svelte-reactivity.json`. Raw reports
include every sample and are gitignored. Historical `results*.json` reports are
also local artifacts excluded from Git. The tables here retain the findings;
rerun the benchmark to collect new samples.

The runner builds into a temporary directory, serves only on localhost, runs
Chromium, and closes the browser and server afterward. It requires no GraphQL
server or generated Houdini packages.

## Correctness and implementation

The benchmark checks field isolation, no-op writes, optimistic rollback,
reordering with retained proxies and DOM nodes, insertion, deletion, nested
updates, nulls, duplicate record occurrences, and cleanup. Browser and unit
suites additionally cover real query and fragment observers, custom hooks,
retained subscription snapshots, source replacement, SSR/hydration, masked
custom keys, and null recovery.

See the [implementation notes](../../packages/houdini-svelte/runtime/reactivity/README.md)
and [usage guide](../../docs/svelte/03-loading-data/06-reactivity.mdx).

## Earlier snapshot experiments

The original prototype reconciled complete immutable snapshots. Its report is
`results.json`. A subsequent `reactive(...).current` adapter
added owned snapshots, readonly views, hidden cache identity and lifecycle
handling. That wrapper API has been removed; its historical measurements remain
in `results-runtime.json`. The `runtime` label in that
older report refers to the removed adapter, not today's field notification path.

At 1,000 plain rows, that adapter took 3.960 ms versus 2.635 ms for stores. With
synthetic formatting it took 4.115 ms versus 9.895 ms. It reduced Svelte work but
still read and compared the whole query, making simple cells slower. Those
results motivated the cache field protocol now measured above. Re-running the
current benchmark does not reproduce the removed adapter.

## Getter and native-array implementation

The initialization optimization pass is recorded in
`results-optimized.json`. It repeats all three table
sizes and both calculation workloads, with three trials and 30 measured updates
per case. All correctness checks pass. At 5,000 rows with ordinary calculations,
the scalar update median is 0.115 ms for the direct field runtime and 18.920 ms for
stores. The synthetic heavier calculation case measures 0.150 ms and 85.340 ms.

These are update timings. The
[dashboard benchmark](../svelte-dashboard/README.md) measures initial mounting,
local filtering, multiple queries, aggregates, and structural changes, including
the remaining mount and filter regressions. Use that report to assess the
initialization work.
