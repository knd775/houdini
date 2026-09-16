import { get, readable, type Readable } from 'svelte/store'
import { fragment, FragmentStore, QueryStore, SubscriptionStore } from '../runtime/index.js'

declare const query: QueryStore<{ name: string }, { id: string }>
const requiresInputs: boolean = query.variables
query.variables = true
const name: string | undefined = get(query).data?.name
// @ts-expect-error Direct reactive fields require the opt-in.
query.data
// @ts-expect-error The legacy input-requirement property keeps its original name.
query.requiresVariables

declare const reference: { ' $fragments': { UserFields: {} } }
declare const store: FragmentStore<{ name: string }, {}>
const row = fragment(reference, store)
const dataStore: Readable<typeof reference> = row.data
row.data = readable(reference)
const pluralData: Readable<ReadonlyArray<typeof reference>> = fragment([reference], store).data
// @ts-expect-error A legacy fragment's data is a store.
row.data.name
// @ts-expect-error FragmentStore.get() retains its original store shape.
store.get(reference).data

declare const subscription: SubscriptionStore<{ name: string }, {}>
const fetching: boolean = get(subscription).fetching
// @ts-expect-error Direct fetching reads require the opt-in.
subscription.fetching
void [requiresInputs, name, dataStore, pluralData, fetching]
