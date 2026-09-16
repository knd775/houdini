import type {
	DocumentArtifact,
	FragmentArtifact,
	GraphQLObject,
	GraphQLVariables,
	QueryArtifact,
	QueryResult,
	SubscriptionArtifact,
} from 'houdini/runtime'
import type { ObserveParams } from 'houdini/runtime/client'
import { fromStore, type Readable, writable } from 'svelte/store'
import { BaseStore as Store } from '../stores/base.js'
import type { ReactiveValue } from './snapshot.js'
import { FragmentListState, ResultState } from './state.svelte.js'

export const fieldUpdates = true
export type FragmentState<T> = { readonly data: ReactiveValue<T> }
export type FragmentData<Data, _Reference> = { readonly data: ReactiveValue<Data> }

export class BaseStore<
	Data extends GraphQLObject,
	Input extends GraphQLVariables | undefined,
	Artifact extends DocumentArtifact = DocumentArtifact,
> extends Store<Data, Input, Artifact> {
	protected fieldUpdates = true
	#result = new ResultState<QueryResult<Data, Input>>(
		() => this.state,
		(...args) => this.subscribeFields(...args)
	)
	get data() {
		return this.#result.get('data')
	}
	get fetching() {
		return this.#result.get('fetching')
	}
	get errors() {
		return this.#result.get('errors')
	}
	get partial() {
		return this.#result.get('partial')
	}
	get stale() {
		return this.#result.get('stale')
	}
	get source() {
		return this.#result.get('source')
	}
	get variables() {
		return this.#result.get('variables')
	}
	get extensions() {
		return this.#result.get('extensions')
	}
}

export class QueryStoreBase<
	Data extends GraphQLObject,
	Input extends GraphQLVariables | undefined,
	Artifact extends QueryArtifact = QueryArtifact,
> extends BaseStore<Data, Input, Artifact> {
	requiresVariables: boolean
	constructor({
		variables,
		...params
	}: ObserveParams<Data, Artifact, Input> & { variables: boolean }) {
		super(params)
		this.requiresVariables = variables
	}
}

export class SubscriptionStoreBase<
	Data extends GraphQLObject,
	Input extends GraphQLVariables | undefined,
> extends BaseStore<Data, Input, SubscriptionArtifact> {
	fetchingStore = writable(false)
	#fetching = fromStore(this.fetchingStore)
	get fetching() {
		// A reader of only fetching still owns the document subscription.
		void super.fetching
		return this.#fetching.current
	}
}

export function readData<Data extends GraphQLObject>(store: BaseStore<Data, any>) {
	return store.data
}

export function withFragmentData<T, Data extends GraphQLObject>(
	value: T,
	store: BaseStore<Data, any>
) {
	return Object.defineProperty(value, 'data', {
		enumerable: true,
		get: () => store.data,
	}) as T & FragmentState<Data | null>
}

export function withFragmentList<T, Data>(value: T, instances: Readable<Data>[]) {
	const state = new FragmentListState(
		instances.map((instance) => () => (instance as Readable<Data> & FragmentState<Data>).data)
	)
	return Object.defineProperty(value, 'data', {
		enumerable: true,
		get: () => state.data,
	}) as T & FragmentState<Data[]>
}

export function fragmentResult<T extends Readable<any>>(instance: T, artifact: FragmentArtifact) {
	return Object.defineProperties(
		{ artifact },
		Object.getOwnPropertyDescriptors(instance)
	) as T & { artifact: FragmentArtifact }
}
