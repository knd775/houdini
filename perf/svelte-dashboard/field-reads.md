# Single-lookup field reads

The property handler now looks up a field once instead of calling
`hasOwnProperty` and then looking it up again. Its backing object has no prototype
and every stored entry is a `Field` object, including entries whose public value
is false, zero, null or undefined. Missing properties still use the existing
`Object.prototype` fallback with the original receiver.

The change is retained as a small simplification. It adds no state, caching,
generated code or public API. **The benchmarks do not establish a filtering
speedup.**

## Filtering

The first comparison places the old runtime and the candidate in one minified
production build. A second comparison swaps their roles: the normal runtime
uses the new handler and the virtual runtime copy restores the old handler.
Both runs rotate execution order and use 24 trials, each with eight warm-up
updates and 20 measured updates, on the 432-task dashboard.

The complete nine-workload run uses six trials per workload at both 144 and
432 tasks. The large page mounts 1,562 components and 1,535 application effects.
Both implementations render the same components and use the same cache/client
pipeline. No other tests from this task ran during the benchmarks.

Median milliseconds, before and after the lookup change:

| Measurement | First comparison | Swapped comparison | Full workload run |
| --- | ---: | ---: | ---: |
| Hide cards | 2.010 → 1.965 | 1.955 → 1.950 | 1.840 → 1.950 |
| Restore cards | 19.365 → 19.000 | 18.400 → 18.310 | 18.745 → 19.590 |
| Pooled filter updates | 16.880 → 16.935 | 16.195 → 16.110 | 17.535 → 17.575 |

The small improvements in the first comparison do not hold across the runs.
Mean filter time drops 2.5% in the first run but increases 1.2% in the swapped
run. The candidate has a lower per-trial mean in 16 of 24 trials initially and
12 of 24 after swapping. There is no consistent whole-page filtering win.

The synthetic title scan with dependency tracking and no DOM changes moves from
0.136 to 0.131 ms across five probe pages. This saves about 0.005 ms in that
diagnostic, which is too small to explain a useful full-page change. The probe
is a different workload and should not be subtracted from the page timings.

On the medium page, the full workload run moves card restoration from 5.025 to
4.870 ms. The large-page result goes the other way, so this does not establish
a general improvement either.

## Startup and memory

Each focused run also measures 12 fresh pages per mode. Download and module
evaluation finish before timing starts. Mount includes reactive setup,
derivations, effects and synchronous DOM construction, excluding layout and paint.

| Measurement | First comparison | Swapped comparison |
| --- | ---: | ---: |
| Fresh-page mount, ms | 92.860 → 93.485 | 91.015 → 93.855 |
| Warm mount, ms | 36.730 → 36.905 | 35.660 → 34.965 |

Fresh-page medians are slightly higher with the new handler. Samples have broad
tails, and mean fresh-page mount changes direction between runs. These data do
not establish a startup improvement or a reliable regression.

Retained projection memory remains about 810 KB and the mounted JavaScript heap
about 5.08 MB. Allocation probes run on separate pages, with forced collection
before retained-heap measurements. These values exclude DOM/renderer memory.

## Cache updates and correctness

The full workload run preserves fast scalar updates. On the large page:

| Update, median ms | Before | After |
| --- | ---: | ---: |
| Title | 0.070 | 0.070 |
| Estimate and derived totals | 0.660 | 0.605 |
| Status | 0.840 | 0.810 |
| Shared user | 0.430 | 0.415 |
| Batch of 40 estimates | 1.415 | 1.320 |
| Reorder | 5.460 | 5.230 |
| Insert/remove | 5.400 | 5.400 |
| Optimistic update and rollback | 1.340 | 1.290 |

Some read-heavy updates improve in this run. Those workloads have not received
the repeated comparisons needed to claim the exact gains are repeatable.

All nine dashboard correctness checks and the mixed sequence pass for both
handlers, including edits to hidden cards and optimistic checkpoints. Scalar
updates retain zero query-root reads, and unmount releases all subscriptions.
The new regression checks falsy values under names such as `__proto__`,
`constructor`, `toString` and `hasOwnProperty`, symbol reads, and the receiver
used by inherited accessors.

Validation passes 404 runtime tests, with five existing todos, all 18 browser
regressions and the public type checks.

## Reproduction and reports

The current source uses the new handler. Compare it with the previous handler:

```sh
PROJECTION_VARIANT=checked-lookup NATIVE_STATE=1 PROJECTS=18 \
  TRIALS=24 COLD_TRIALS=12 PROBES=1 pnpm bench:svelte:dashboard
```

Run all workloads at both page sizes:

```sh
PROJECTION_VARIANT=checked-lookup TRIALS=6 pnpm bench:svelte:dashboard
```

`fields` means the current source and `checked-lookup` restores only the old
property handler in virtual runtime modules. The earlier projection optimizations
remain enabled in both. `checked-lookup-single` restores the handler in a separate
build without duplicate runtime modules. The transformation checks its source
anchors and fails if the relevant code changes.

- First comparison, including allocation probes: `results-single-lookup.json`.
  In this historical report, `fields` is the old handler and `single-lookup` is
  the candidate.
- Comparison with the runtime copies swapped: `results-single-lookup-reversed.json`.
  `fields` is the new handler and `checked-lookup` is the old one.
- All workloads at both page sizes: `results-single-lookup-full.json`.
  Mode meanings match the swapped comparison.

Raw reports retain every sample. Filter iterations alternate hiding and restoring
cards. With the recorded even warm-up and update counts, even sample offsets
within each trial hide cards and odd offsets restore them.
