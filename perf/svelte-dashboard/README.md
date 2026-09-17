# Complex Svelte dashboard benchmark

This compares `$Query.data` with direct `Query.data` through real `QueryStore`
instances, `DocumentStore`, the default Houdini client pipeline, and the normalized
cache. Both modes render the same Svelte components. No wrapper API or per-row
subscriptions are involved.

The field API is opt-in through `experimentalFieldReactivity: true` in the
top-level Houdini configuration. The runner selects the experimental runtime
for `fields` and a separate legacy query class for `store`. Both share the same
cache and client, and run separately so their subscriptions do not affect each
other's measurements. The legacy run omits field-change tracking and reactive
record metadata.

The reports below predate the opt-in split. New runs use the two runtime modes;
the earlier reports retain their original measurements.

## The page

The dashboard has 14 component types: an application shell, dashboard, summary,
metric, project, board column, task card, progress meter, avatar, team list,
workload chart, activity feed, activity event, and task inspector.

Three queries supply the workspace, people, and activity. User and task records
are shared across query selections and repeated in multiple components.

| Page size | Projects | Tasks | Mounted components | Active application effects | DOM elements | Cache subscriptions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Medium | 6 | 144 | 530 | 515 | 1,479 | 3 |
| Large | 18 | 432 | 1,562 | 1,535 | 4,359 | 3 |

Derived values flatten projects into tasks, filter cards into status columns,
calculate estimates and completion, group open work by assignee, rank workloads,
sort the team, format metrics, and derive labels and progress. There are chains
such as task estimates → grouped hours → ranked people → chart bars.

Effects read titles, statuses, presence, completion, and selection. They publish
to in-memory sinks standing in for application integrations. They remain active
in timing runs; diagnostic counters are disabled. There are no synthetic busy
loops. All tasks remain mounted except when filtered out or moved between columns.

## Cache-backed view experiment

A later experiment tested lazy cache-backed records with shared scalar signals.
It did not improve startup, so the experimental runtime keeps the existing projection.
See [the experiment report](./cache-views.md) for the implementation patch,
startup and first-update measurements, and a native Svelte state control.

## Results

The [simplification pass](./simplification.md) removes the internal result-envelope
proxy, the redundant previous-snapshot argument and temporary metadata copies.
Its follow-up removes redundant cache selection wrappers and centralizes record
metadata copying. Both passes preserve the public API and show broadly comparable
page timings.

The [field-read follow-up](./field-reads.md) tests a simpler property lookup.
It retains the small code simplification but finds no consistent filtering win.

The [initial projection profile](./projection-profile.md) follows the generated
record experiment. It retains two small runtime changes that reduce projection
work and memory, with no established whole-page startup or filtering win.

The [generated record experiment](./generated-records.md) compares fixed
record classes with the current projector in the same browser run. It also adds
allocation measurements and a filtering probe without DOM updates.

The tables below describe the earlier getter-based implementation. See
[the follow-up profile and integration report](./owned-views.md) for the current
implementation, fresh-page measurements, and remaining filtering overhead.

Median milliseconds per update, including cache writes, client propagation,
reactive calculations, application effects, and synchronous Svelte DOM updates:

| Tasks | Update | `$Query.data` | `Query.data` | Change |
| ---: | --- | ---: | ---: | --- |
| 144 | Task title | 2.405 | 0.075 | 32.1× faster |
| 144 | Estimate feeding totals and charts | 2.485 | 0.400 | 6.2× faster |
| 144 | Status change moving a card | 2.695 | 0.590 | 4.6× faster |
| 144 | Shared user name across three queries | 2.805 | 0.305 | 9.2× faster |
| 144 | 40 estimates in one cache write | 2.700 | 1.035 | 2.6× faster |
| 144 | Reorder one project's task list | 3.070 | 2.615 | 1.2× faster |
| 144 | Insert/remove one task | 3.060 | 2.695 | 1.1× faster |
| 144 | Local search filter | 4.200 | 4.765 | 13% slower |
| 144 | Optimistic estimate plus rollback | 5.285 | 0.830 | 6.4× faster |
| 432 | Task title | 6.765 | 0.070 | 96.6× faster |
| 432 | Estimate feeding totals and charts | 6.460 | 0.700 | 9.2× faster |
| 432 | Status change moving a card | 7.100 | 0.900 | 7.9× faster |
| 432 | Shared user name across three queries | 7.910 | 0.415 | 19.1× faster |
| 432 | 40 estimates in one cache write | 7.005 | 1.440 | 4.9× faster |
| 432 | Reorder one project's task list | 7.530 | 5.490 | 1.4× faster |
| 432 | Insert/remove one task | 7.345 | 5.560 | 1.3× faster |
| 432 | Local search filter | 14.130 | 17.000 | 20% slower |
| 432 | Optimistic estimate plus rollback | 13.700 | 1.410 | 9.7× faster |

The optimistic case measures two writes and two flushes: display the optimistic
estimate, then clear and resolve its layer and display the original estimate. A reorder
reverses one project's task list. Insertion alternates adding and removing one
card. These relationship changes use full project task-list payloads, including
normalization of unchanged existing records. The batch changes 40 normalized
task estimates in one write. Local filtering alternates a title search and the
complete board without writing to the cache.

### Initial mount

The cache is populated before these measurements. Query preparation includes
three cache-only fetches through the client pipeline. Mount includes component
creation, initial state capture/indexing, initial derivations and effects, and
synchronous DOM construction. It excludes layout and paint.

| Tasks | Store preparation | Fields preparation | Store mount | Fields mount |
| ---: | ---: | ---: | ---: | ---: |
| 144 | 2.250 ms | 2.270 ms | 9.690 ms | 13.935 ms |
| 432 | 5.815 ms | 5.845 ms | 27.270 ms | 38.975 ms |

These are medians across 45 fresh mounts per mode and size. They measure a warm
application repeatedly mounting a page, not cold startup, JavaScript download,
cache population, or network requests.

## What reruns

Diagnostics use the medium page. A task-title change updates its card, the
inspector, and an activity event. Both modes make exactly three DOM mutations,
preserve mounted components, and produce identical output.

| Work for that title update | Store | Direct fields |
| --- | ---: | ---: |
| Instrumented derived calculations | 1,005 | 2 |
| Application effects | 503 | 2 |
| Complete query reads | 2 | 0 |
| Record selection reads | 368 | 2 |
| DOM mutations | 3 | 3 |

A shared user's rename crosses all three queries. Derived calculations fall
from 1,031 to 39, effects from 515 to 1, and full query reads from 3 to 0. All
avatars, activity text, sorted team entries, and workload labels agree afterward.

Changing an estimate still recomputes totals and workload grouping because those
calculations depend on that estimate. The field path cannot skip necessary
aggregations. It avoids unrelated labels, filters, presence effects, and query
reconstruction.

Reordering reads the full dashboard in both modes. Direct fields reduce derived
calculations from 932 to 16. The optimized implementation now beats the store
path for reordering and insertion/removal at both page sizes.

The first local-filter step runs the same 42 instrumented derived calculations and
18 existing effects in both modes, and performs no cache reads. The new native
arrays reduce iteration overhead. Tracking fields and establishing dependencies
when cards remount still cost more than reading plain store snapshots.

## Optimization pass

The previous implementation wrapped deep Svelte state in a second readonly proxy.
The new data view uses readonly record getters backed by raw Svelte signals, and
frozen native arrays. It shares getter descriptors for equal shapes, registers
records during initial projection, and indexes records instead of allocating a
separate target map for every scalar field. The small response envelope uses a
reactive map so newly appearing metadata cannot invalidate unchanged data.
All Svelte APIs used by the runtime are public.

Scalar edits retain ancestor references. Membership and ordering changes replace
arrays while retaining surviving keyed record objects. Adding or removing object
keys replaces that object. Tests cover these reference semantics, readonly
reflection, sparse arrays, arbitrary JSON keys, aliases, and duplicate records.

| Work on the large page | Previous fields | Optimized fields | Current store |
| --- | ---: | ---: | ---: |
| Initial mount | 59.385 ms | 38.975 ms | 27.270 ms |
| Local filtering | 24.010 ms | 17.000 ms | 14.130 ms |
| Reorder | 8.335 ms | 5.490 ms | 7.530 ms |
| Insert/remove | 8.665 ms | 5.560 ms | 7.345 ms |
| Estimate and aggregates | 1.835 ms | 0.700 ms | 6.460 ms |

Mount improved 34%, and filtering improved 29%, relative to the previous recorded
run on the same machine. The old report remains in `results.json`;
the current report is `results-optimized.json`. These
are separate runs, so the current store comparison is the stronger evidence for
remaining regressions. Store mount was 27.130 ms in the previous run and 27.270 ms
in this run.

## Implications

Field updates remain effective across multiple queries, derived chains, and
component boundaries. Native arrays also improve aggregate calculations and
structural updates.

Initialization is still a blocker for the proposed performance target. The large
page mounts 43% slower than the store version; filtering remains 20% slower.
The medium page has 44% mount overhead and 13% filter overhead. Owned snapshot
capture, view construction, signal allocation, and initial dependency tracking
still add work that plain store snapshots avoid. This pass reduces that cost; it
does not establish that direct fields are faster for every workload.

The [cache-backed view experiment](./cache-views.md) follows up on reducing eager
projection. It measures cache population, full startup, and the first update in
addition to steady updates. The first implementation regressed startup and was
kept as an experimental patch.

## Correctness

The production-built browser checks all nine workloads through both APIs, four
updates per workload. After every update it compares all rendered text,
attributes, input values, and element ordering. It independently checks cache
snapshots against totals, visible cards, assignee workloads, shared names, and
activity sentences. It checks the optimistic intermediate state before rollback,
and verifies that unaffected cards retain their DOM nodes.

A separate eleven-action sequence combines filtering, edits to hidden cards,
a shared-user update, aggregate and status changes, a batch, optimistic rollback,
restoring the full board, reordering, insertion, and removal. Both APIs must
produce identical output at each step. All cache subscriptions must disappear
when the page unmounts, and completed updates must leave only the base cache
layer. Scalar diagnostics assert that no query root is read.

All checks passed. These tests exercise hand-authored artifact selections and
real runtime components, rather than generated application artifacts or a GraphQL
server. They do not replace the separate SSR/hydration suite.

## Method and reproduction

The production build uses Svelte 5.56.2 and headless Chromium 153.0.8010.12 on
Linux x64, Intel Xeon E5-2680 v3, Node 24.19.0. Recorded September 15, 2026.
There are five trials per mode, size, and workload, each with eight warm-up and
twenty measured updates. Each case has 100 timing samples. Every trial mounts a
fresh page and resets the cache. Mode order alternates across trials. No other
tests were running during the recorded benchmark.

Read spies, DOM observers, model checks, and diagnostic counts are outside timing
runs. Effects remain active. Timings cover writes plus `flushSync`, excluding
browser layout, paint, full frame latency, garbage-collection attribution, memory
usage, network requests, and the mutation request pipeline. Local headless-browser
measurements are not guarantees for deployed apps. Long-tail pauses are visible
in the p95 data, particularly in the store and structural workloads.

Run the benchmark and its correctness checks:

```sh
pnpm exec playwright install chromium
pnpm bench:svelte:dashboard
```

A correctness-only run:

```sh
VERIFY_ONLY=1 pnpm bench:svelte:dashboard
```

A quick benchmark:

```sh
PROJECTS=6 TRIALS=1 UPDATES=3 WARMUP=1 pnpm bench:svelte:dashboard
```

`PROJECTS` accepts comma-separated project counts. `TASKS` sets tasks per project.
`TRIALS`, `UPDATES`, and `WARMUP` control repetitions. `CHROMIUM_EXECUTABLE` selects
an installed browser. `SCREENSHOT=/tmp/dashboard.png` saves the medium page after
testing. `OUTPUT` changes the raw report path.

`COLD_TRIALS=9` also measures the first mount in fresh browser pages, rotating API
order. The report's `coldStart` section includes cache population, query preparation,
mounting and the first filter update. Download and module evaluation finish before
these timers start; this is a fresh-page application measurement, not total page load.

The default raw report is `perf/benchmark.svelte-dashboard.json`, which is
ignored by git. Correctness-only output goes to
`perf/benchmark.svelte-dashboard-check.json`. Historical `results*.json` reports
are also local artifacts excluded from Git. The tables in these documents retain
the findings; rerun the benchmark to collect new samples. The runner uses temporary
build files and a localhost server, and cleans them up afterward.

CPU profiles can be captured with:

```sh
PROFILE=/tmp/dashboard-profiles VERIFY_ONLY=1 pnpm bench:svelte:dashboard
```

This profiles 30 large-page mounts and 30 filter updates per API after warm-up.
Profile builds disable minification to retain readable function names. Use the
normal benchmark command for timing comparisons; profile timings include sampling
and use a different build configuration.

A native Svelte `$state` control for mounting and local filtering:

```sh
NATIVE_STATE=1 PROJECTS=18 TRIALS=45 pnpm bench:svelte:dashboard
```

This mode compares store snapshots, Houdini direct fields, and native deep state.
The native control wraps prepared query snapshots and does not implement cache
updates. It renders the same page and owns the same three query subscriptions.
It validates the complete DOM after filtering. It is a control for Svelte's
tracking cost, not a third Houdini implementation. Mode order rotates each trial.

New reports include fixture creation/cache population, query preparation, mount,
total startup, and each workload's first update before warm-up. Older reports do
not contain these additional fields.

## Readonly array diagnostics

The `native-array-errors` variant isolates the cost of clearer errors for array
mutations. It uses the same field runtime with plain frozen arrays; the current
runtime adds shared, non-enumerable methods that explain how to make a local copy.
Array prototypes and iteration remain native.

On September 16, 2026, a paired run with 432 tasks and 15 trials per workload gave
these medians. Mount combines 135 samples per mode; updates use 150 samples each.

| Work | Native errors | Clearer errors |
| --- | ---: | ---: |
| Mount | 34.47 ms | 34.83 ms |
| Scalar title update | 0.080 ms | 0.080 ms |
| Local filtering | 16.26 ms | 16.07 ms |
| Reorder | 5.35 ms | 5.41 ms |

The measured mount difference was about 1%. These small differences do not
establish a filtering improvement. All nine workloads and the mixed sequence
passed for both field variants and legacy stores. Legacy mount was 27.85 ms, so
the existing field initialization overhead remains.

```sh
PROJECTION_VARIANT=native-array-errors PROJECTS=18 TRIALS=15 UPDATES=10 WARMUP=4 pnpm bench:svelte:dashboard
```

The local raw report is `results-feedback-array-errors-paired.json`, excluded
from Git with the other benchmark captures.
