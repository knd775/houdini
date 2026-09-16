import type {
	FragmentArtifact,
	GraphQLObject,
	GraphQLVariables,
	QueryArtifact,
	SubscriptionArtifact,
} from 'houdini/runtime'
import type { ObserveParams } from 'houdini/runtime/client'
import { get, type Readable, writable } from 'svelte/store'
import { BaseStore } from './base.js'

export { BaseStore }
export const fieldUpdates = false
export type FragmentState<_Data> = {}
export type FragmentData<_Data, Reference> = { data: Readable<Reference> }

export class QueryStoreBase<
	Data extends GraphQLObject,
	Input extends GraphQLVariables | undefined,
	Artifact extends QueryArtifact = QueryArtifact,
> extends BaseStore<Data, Input, Artifact> {
	variables: boolean
	constructor({
		variables,
		...params
	}: ObserveParams<Data, Artifact, Input> & { variables: boolean }) {
		super(params)
		this.variables = variables
	}
}

export class SubscriptionStoreBase<
	Data extends GraphQLObject,
	Input extends GraphQLVariables | undefined,
> extends BaseStore<Data, Input, SubscriptionArtifact> {
	fetchingStore = writable(false)
}

export function readData<Data extends GraphQLObject>(store: BaseStore<Data, any>) {
	return get(store).data
}

export function withFragmentData<T, Data extends GraphQLObject>(
	value: T,
	_store: BaseStore<Data, any>
): T {
	return value
}

export function withFragmentList<T, Data>(value: T, _instances: Readable<Data>[]): T {
	return value
}

export function fragmentResult<T extends Readable<any>>(instance: T, artifact: FragmentArtifact) {
	return { ...instance, artifact, data: { subscribe: instance.subscribe } }
}
