import { getCacheUpdate } from 'houdini/runtime/cache/updates'
import { computeID, keyFieldsForType } from 'houdini/runtime/config'
import { untrack } from 'svelte'
import { createSubscriber, SvelteMap } from 'svelte/reactivity'
import type { Readable } from 'svelte/store'
import { getCurrentConfig } from '$houdini/runtime/config'
import { FieldIndex } from './fields.js'
import { project, readonlyArray, reconcile } from './projection.svelte.js'
import type { ReactiveValue, ResultKey } from './snapshot.js'

// Generated projects can target ES2021.
const owns = Object.prototype.hasOwnProperty

/** Internal state owned by a store. Reads acquire a subscription in Svelte effects. */
export class ResultState<T extends { data: unknown }> {
	// Metadata keys can appear independently (e.g. extensions after a response).
	// Keep their signals separate from data even when the envelope changes shape.
	#values = new SvelteMap<string, unknown>()

	#last: T | undefined
	#fields: FieldIndex | undefined
	#track: () => void
	#read: () => T
	#key: ResultKey

	constructor(read: () => T, subscribe: Readable<T>['subscribe']) {
		this.#read = read
		const config = getCurrentConfig()
		this.#key = (value) => {
			if (typeof value.__typename !== 'string') return undefined
			const fields = keyFieldsForType(config, value.__typename)
			if (!fields.length || fields.some((field) => value[field] == null)) return undefined
			return `${value.__typename}:${computeID(config, value.__typename, value)}`
		}
		this.#track = createSubscriber(() => {
			let initial = true
			let active = true
			let starting = true
			let failed = false
			let failure: unknown
			const stop = subscribe((next) => {
				if (!active) return
				try {
					this.#update(next, !initial, true)
					initial = false
				} catch (error) {
					if (!starting) throw error
					failed = true
					failure = error
				}
			})
			starting = false
			if (failed) {
				active = false
				stop()
				throw failure
			}
			return () => {
				active = false
				stop()
			}
		})
	}

	get<K extends keyof T & string>(field: K): ReactiveValue<T[K]> {
		this.#track()
		// Non-reactive reads and SSR use the latest value without acquiring a
		// listener. Resuming after a gap needs a full read, not just the last patch.
		this.#update(this.#read(), false)
		return this.#values.get(field) as ReactiveValue<T[K]>
	}

	#update(next: T, allowFields: boolean, emitted = false) {
		if (next === this.#last && !emitted) return
		untrack(() => {
			const initial = this.#last === undefined
			if (initial) this.#fields = new FieldIndex()
			const update = allowFields ? getCacheUpdate(next) : undefined
			const patched = update && this.#fields?.apply(update, this.#key)

			for (const field of this.#values.keys()) {
				if (!owns.call(next, field)) this.#values.delete(field)
			}
			for (const field of Object.keys(next)) {
				// A successful field patch already updated the data view. Do not
				// evaluate the lazy snapshot while publishing the other result fields.
				if (patched && field === 'data') continue
				const value = this.#values.has(field)
					? reconcile(this.#values.get(field), next[field as keyof T], this.#key)
					: project(
							next[field as keyof T],
							initial && field === 'data' ? this.#fields!.add : undefined
						)
				this.#values.set(field, value)
			}
			// Initial projection builds the index as it creates records. Full
			// reconciliation reindexes fresh metadata even when views survive.
			if (!initial && !patched)
				this.#fields = new FieldIndex(this.#values.get('data'), next.data)
			this.#last = next
		})
	}
}

export class FragmentListState<T> {
	#readers: Array<() => T> = []
	#values = $derived(readonlyArray(this.#readers.map((read) => read())))
	constructor(readers: Array<() => T>) {
		this.#readers = readers
	}
	get data(): readonly T[] {
		return this.#values
	}
}
