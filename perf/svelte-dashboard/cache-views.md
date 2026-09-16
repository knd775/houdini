# Lazy cache view experiment

The prototype works for the tested scenarios, but it regresses startup and
filtering. The experimental runtime retains the existing field projection. The
prototype is preserved in [cache-views.patch](./cache-views.patch).

## What changed

The prototype replaces eager query projection and its record index with selected
record views. Reading a relationship creates its child views. Reading a scalar
acquires a Svelte `$state.raw` cell shared by normalized record ID and field key,
including argument values. Multiple queries reading the same field share a cell.
Scalar writes update the cell directly; structural changes reconcile materialized
relationships. Unmount releases each query's retained scalar cells.

Normal subscribers still receive snapshots. A cache result gives the view its
selected tree without copying it when no ordinary consumer has seen it. Mixed
snapshot and view consumers cross an ownership boundary that copies or rereads
data. Custom hooks retain the full-snapshot fallback.

This is only a partially lazy cache reader. Initial query evaluation still walks
the selection for masking, completeness, scalar decoding, and null propagation.
Accessing an array creates its record views, though nested relationships and
scalar cells remain lazy. The experiment avoids the extra eager projection pass;
it does not eliminate Houdini's initial selection evaluation.

## Measured results

The same dashboard has 432 tasks, 1,562 components, 1,535 application effects,
three queries, and 4,359 DOM elements. All values below are median milliseconds.

| Large dashboard | Existing fields | Lazy cache views |
| --- | ---: | ---: |
| Cache population and fixture creation | 10.245 | 11.125 |
| Query preparation | 6.015 | 6.420 |
| Mount | 41.130 | 51.625 |
| Total startup | 61.520 | 72.320 |
| Local filtering | 17.460 | 19.145 |
| Task title update | 0.070 | 0.070 |
| Estimate and aggregates | 0.670 | 0.825 |
| Shared user name | 0.390 | 0.385 |
| Reorder | 5.655 | 4.615 |
| Insert/remove | 5.720 | 5.130 |
| Optimistic estimate and rollback | 1.370 | 1.770 |

Mount regressed 26%, total startup 18%, and filtering 10%. Reordering improved
18%. The medium page also regressed on mount, from 13.575 to 15.265 ms.
Independent phase medians need not add up to the median total startup time.

First updates are recorded before warm-up. A first title edit took 0.205 ms with
the existing implementation and 0.215 ms with the prototype. A first estimate
edit took 0.980 and 1.440 ms respectively. Deferring work did not produce a hidden
startup improvement in these measurements.

These are separate full runs on the same machine. Each has 45 mounts per API and
size, and 100 steady samples per workload. The store controls mounted the large
page in 28.295 and 27.120 ms respectively, so the prototype's larger mount cost
cannot be explained by a uniformly slower second run. Timing variation still
limits conclusions about small differences.

Raw data: `results-cache-views-control.json`,
`results-cache-views.json`. The prototype report includes the
SHA-256 of its source patch.

## Native Svelte control

A separate run uses the same page with native deep `$state` around prepared query
snapshots. It owns the same query subscription lifetimes but has no cache-to-state
update bridge. Only mounting and local filtering are measured in that mode.

| Large dashboard | Store snapshots | Existing fields | Native `$state` |
| --- | ---: | ---: | ---: |
| Mount | 29.655 | 38.955 | 36.620 |
| Total startup | 49.455 | 57.105 | 55.810 |
| Local filtering | 14.295 | 16.975 | 17.515 |

There are 45 mounts and 900 steady filter samples per mode, with rotating mode
order. Filtering produces identical DOM in the native and store controls.
`results-native-state.json`.

Native Svelte tracking adds work on this page too. The existing field view is
about 6% slower to mount than this native control, while the new lazy adapter
adds more bookkeeping and signal setup. This does not prove a lower bound or
that further optimization is impossible. The native control also omits the live
cache bridge and cannot establish cache-update performance.

Profiling the earlier reactive-map version of the prototype showed record-view
construction, lazy field lookup, cache access, and garbage collection consuming
mount time. The retained version uses raw rune cells with a short-lived
`$effect.root` at allocation so a cell is independent of the derived expression
that first reads it. It uses public Svelte APIs. That allocation context and the
shared-cell registry still cost work absent from ordinary store snapshots.

## Validation and limits

The prototype passed 265 unit tests, 15 browser tests, and all dashboard checks:
nine workloads, four updates per workload, optimistic checkpoints, and the mixed
sequence containing edits to hidden cards. Query subscriptions return from three
to zero after unmount. Shared-user updates require one record read rather than
one read per query.

This is an experimental patch, not production-ready code. In particular, removed
records' scalar cells remain retained until their query unmounts. Long-lived query
pruning, variable ownership, and real-query SSR need dedicated coverage before
promoting the model. The generic SSR test passed, but it does not exercise the
new cache-backed reader. No memory benchmark was performed.

The default keeps the faster implementation. Two small runtime changes avoid
temporary subscriptions when reading existing observer state. Setup reads
variables directly; fetch explicitly materializes its returned data to preserve
snapshot semantics. A browser regression test checks that retained fetch results
stay unchanged while direct fields update.

The benchmark now records population, preparation, mount, total startup, and the
first update. It still excludes network requests, browser layout and paint, and
JavaScript download. These are warm application mounts in headless Chromium.

## Reproduce

Run the current implementation and native control:

```sh
OUTPUT=/tmp/control.json pnpm bench:svelte:dashboard
NATIVE_STATE=1 PROJECTS=18 TRIALS=45 OUTPUT=/tmp/native.json pnpm bench:svelte:dashboard
```

To run the archived prototype, apply the patch to a disposable copy of this
working tree, including its uncommitted files. The patch targets the current
field-reactivity implementation, not the repository's original HEAD.

```sh
git apply --check perf/svelte-dashboard/cache-views.patch
git apply perf/svelte-dashboard/cache-views.patch
OUTPUT=/tmp/cache-views.json pnpm bench:svelte:dashboard
pnpm test:svelte
git apply --reverse perf/svelte-dashboard/cache-views.patch
```

Set `CHROMIUM_EXECUTABLE` when using a preinstalled browser. The patch keeps the
experimental deferred-fetch behavior used in the measured run; the default
runtime preserves eager fetch snapshots. Reproduction timings will vary.
