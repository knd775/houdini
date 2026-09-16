# Generated record experiment

This is a build-time prototype for fixed record layouts backed directly by Svelte
runes. It keeps `Query.data` and the existing cache update, reconciliation and
subscription behavior. Houdini's shipped runtime and compiler are unchanged.
See the [measurement report](../generated-records.md) for results and the decision
to keep this implementation experimental.

`generate.mjs` walks the benchmark's artifact selections and deduplicates visible
field shapes. It emits a class for each shape, with one private raw value and one
private `$state.raw` field per property. The generated code uses public Svelte
syntax and goes through the normal Svelte compiler. It has no runtime code
evaluation or imports from Svelte internals.

Classes use shared getter descriptors installed as enumerable own properties.
The base constructor returns a plain object; JavaScript then installs the derived
class's private fields on that object. This preserves `Object.prototype`,
`Object.keys`, spreads and JSON serialization without a proxy. Freezing the object
blocks application writes while internal methods can still update private fields.
The existing projector handles arrays, Dates and opaque custom scalar classes.
Records with unmatched shapes use the original proxy implementation.

## Isolation and comparison

`plugin.mjs` applies the experiment only inside the benchmark or test build.
It checks that the expected projection code exists before substituting record
construction and internal reads/writes. If the runtime changes, the substitution
fails rather than silently measuring the original implementation.

`GENERATED_RECORDS=paired` loads both implementations in the same browser build.
The plugin makes virtual copies of the query store, base store, result state,
field index and projector, redirecting only the copies' imports. The original
modules remain untouched. Both implementations share the same cache and client
code and render the same components. Trials rotate between stores, original
fields, generated fields, and optionally native Svelte state.

`GENERATED_RECORDS=1` replaces the projector within that test build. This mode runs
the existing unit/browser regressions against generated records and measures
bundle size without including two copies of the runtime.

The generator is not connected to Houdini's compiler. The benchmark selections
are its inputs, and the validation module supplies shapes for existing fixtures.
Passing these checks does not establish complete generated-artifact coverage for
arbitrary applications. The paired run's projection probe reports how many
records actually use generated classes.

## Run

From the repository root:

```sh
# Paired startup/filtering measurements, including native state.
GENERATED_RECORDS=paired NATIVE_STATE=1 PROJECTS=18 TRIALS=24 COLD_TRIALS=12 PROBES=1 pnpm bench:svelte:dashboard

# All nine dashboard workloads at both page sizes.
GENERATED_RECORDS=paired TRIALS=6 pnpm bench:svelte:dashboard

# Generated records through existing runtime and browser regressions.
pnpm exec vitest run --config perf/svelte-dashboard/generated-records/vitest.config.mjs
GENERATED_RECORDS=1 pnpm test:svelte
```

Use `CHROMIUM_EXECUTABLE` for an installed browser, `OUTPUT` for the JSON report,
and `TMPDIR` if the system temporary directory has insufficient space.

## Additional probes

`PROBES=1` uses five fresh pages per mode and phase on the 432-task dashboard.
Query preparation happens before measuring projection or mounting. Native state
has only a mount probe, because its projection is owned by the component.

Chromium allocation sampling includes objects collected by both major and minor
garbage collections. Samples use a 16 KiB interval. Retained JavaScript heap is
the difference after forced collection before and after a phase. These estimates
exclude browser DOM/renderer memory. Construction times recorded during sampling
include profiler overhead and should not replace the unprofiled startup trials.

Filtering allocation samples cover 20 page updates after eight warm-ups. A
separate synthetic effect scans titles 200 times without changing the DOM. It
measures field reads, dependency tracking and effect scheduling, not a complete
search interaction. Probe pages are separate from all normal timing trials.
