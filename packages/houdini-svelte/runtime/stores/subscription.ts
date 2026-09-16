import type {
	GraphQLVariables,
	QueryResult,
	SubscriptionArtifact,
	GraphQLObject,
} from 'houdini/runtime'
import { CompiledSubscriptionKind } from 'houdini/runtime'
import { derived, type Subscriber } from 'svelte/store'

import { initClient } from '../client.js'
import { getSession } from '../session.js'
import { SubscriptionStoreBase } from './mode.js'

export class SubscriptionStore<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables | null | undefined,
> extends SubscriptionStoreBase<_Data, _Input> {
	kind = CompiledSubscriptionKind

	constructor({ artifact }: { artifact: SubscriptionArtifact }) {
		super({ artifact })
	}

	async listen(variables?: _Input, args?: { metadata: App.Metadata }) {
		this.fetchingStore.set(true)
		await initClient()
		this.observer.send({
			variables,
			session: await getSession(),
			metadata: args?.metadata,
		})
	}

	async unlisten() {
		this.fetchingStore.set(false)
		await initClient()
		await this.observer.cleanup()
	}

	subscribe(
		run: Subscriber<QueryResult<_Data, _Input>>,
		invalidate?: ((value?: QueryResult<_Data, _Input> | undefined) => void) | undefined
	): () => void {
		// add the local fetching store to the default behavior
		return derived(
			[{ subscribe: super.subscribe.bind(this) }, this.fetchingStore],
			([$parent, $fetching]) => ({
				...$parent,
				fetching: $fetching,
			})
		).subscribe(run, invalidate)
	}
}
