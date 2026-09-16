import { untrack } from 'svelte'
import { reconcile } from './reconcile.js'

// Deliberately not exported from houdini-svelte. This tests the snapshot adapter,
// without changing cache notifications or the public query/fragment APIs.
export class ReactiveResult {
	data = $state(null)
	#identity
	#snapshot

	constructor(initial, identity) {
		this.#identity = identity
		this.apply(initial)
	}

	apply(snapshot) {
		untrack(() => {
			this.data = reconcile(this.data, snapshot, this.#identity, this.#snapshot)
			this.#snapshot = snapshot
		})
	}
}
