# Experimental Svelte field reactivity

Query stores expose reactive getters directly: `query.data`, `query.fetching`,
`query.errors`, and the other result metadata. `query.fetch()` and pagination
methods stay on the same object. Plain fragment instances expose `fragment.data`.
Enable `experimentalFieldReactivity: true` in the top-level Houdini
configuration and regenerate. It defaults to false.

Generation selects `stores/mode.ts`, which exports either the legacy or
experimental store implementations and types. Fetching, pagination and observer
ownership share their existing implementations. Legacy builds keep the boolean
`Query.variables` and readable fragment `data`, and do not import the rune-based
result implementation. Experimental builds expose current inputs through
`Query.variables` and move the boolean to `Query.requiresVariables`.

## Ownership and updates

`state.svelte.ts` owns the selected reactive tree. Svelte's public
`createSubscriber` API ties the underlying subscription to effects that read the
store. SSR and non-reactive reads acquire no listener. Resuming after an inactive
period reads a complete result so missed patches cannot leave stale values.
Lifecycle guards reject late callbacks and cancel observer setup when the last
reader leaves while the client is loading. A store can emit synchronously before
returning its cleanup function, so initial projection errors are held until that
function is available, then cleaned up and rethrown.

`fields.ts` indexes selected record occurrences by cache ID, then resolves changed
field keys within those records, including aliases and variables. Initial
projection registers records as it builds them. For scalar cache
updates it reads only the changed fields, validates the batch, and edits their
Svelte signals. Metadata updates reuse the unchanged data view by reference.
Neither step walks the table.

For field-aware reads, the cache resolves abstract and loading selections, then
attaches the concrete field map, record ID and variables as hidden metadata. The field index consumes
that map directly, including when the result masks the typename. Snapshot and
view builders share a metadata-copy function. Each copy owns its null-propagation
flag; field maps and variables retain their existing references.

`projection.svelte.ts` copies incoming plain containers into an owned view. That
view also holds the previous values for reconciliation, including same-object
store emissions. It avoids allocating a second complete snapshot. Each record
uses one readonly proxy over raw Svelte signals. Internal comparisons read the
private field values directly, avoiding proxy reflection and reactive tracking.
Arrays are frozen native arrays, so iteration does not go through proxies.
Standard Dates are copied and their published timestamps are retained separately;
mutating a returned Date cannot hide a later cache update. Only public Svelte APIs are used.
Result fields use a separate reactive map. Store getters read a named field
directly, so adding extensions cannot invalidate unchanged data readers. There
is no additional proxy for the result envelope. A successful cache patch skips
the lazy data getter while the same publication loop updates the metadata.

Scalar updates retain ancestor references. Membership changes replace arrays;
adding or removing object keys replaces that object. Reconciliation retains keyed
records through reordering, including separate objects for duplicate occurrences.
Reconciliation takes only the owned current value and the incoming value, plus
the record-key function. It does not need a separate previous snapshot.

Relationship changes, null propagation, cache resets, and unindexed results
reconcile the full selection and rebuild the index. This slower
path preserves ordering, masking, custom scalar conversion, and record identity.
Record proxies and frozen arrays reject writes; mutations go through the cache.
The index always uses fresh cache selection metadata when it reuses a view, so
changed variables and null propagation cannot leave it using an old selection.

The scalar patch path still captures incoming values before publication. This
validates nested JSON and cycles for the complete batch before changing any
signals. It is separate from the owned view used for comparison.

## Snapshot compatibility

Cache writes retain changed record/field pairs through nested writes. Ordinary
cache subscriptions still receive eager snapshots. Internal field consumers
request a lazy snapshot alongside those pairs. Query and fragment plugins carry
that internal message through the document observer.

The cache collects those pairs only while a field-aware subscription is active.
Ordinary reads skip reactive record metadata, and ordinary notifications return
eager data properties without lazy result metadata.

`DocumentStore.subscribeUpdates` is an internal channel. Normal `.subscribe()`
callbacks materialize data before invoking application code, so retained callback
values remain snapshots. Custom client hooks also force materialization and
invalidate the field hints, because their transformations must be respected.
Audited core hooks can pass the update through without reading data.

In experimental mode, `$query` syntax remains a normal store subscription and
therefore retains Svelte's whole-store invalidation behavior. Direct `query.data`
reads use the new field dependencies. The old boolean `query.variables` becomes
`query.requiresVariables`; `query.variables` now exposes the current inputs.

## Validation

`pnpm test:svelte` runs public type checks for both generated APIs and browser
tests through the default client pipeline. Legacy checks cover property types,
snapshots, cleanup, and absence of reactive runtime imports. Experimental checks
include SSR/hydration, cleanup, field isolation, snapshot
retention, null recovery, and a check that scalar writes never read the query
root. Root Vitest covers reconciliation, store ownership, cache behavior, and
client plugins. `pnpm bench:svelte` compares stores, the original snapshot
prototype, the experimental field state implementation, and row subscriptions in a
production Svelte build.
`pnpm bench:svelte:dashboard` compares the legacy and experimental store classes
on a component-rich page, including mounting, filtering, aggregates, shared records,
and structural changes. See its report for
the remaining mount and filter overhead relative to plain store snapshots.
