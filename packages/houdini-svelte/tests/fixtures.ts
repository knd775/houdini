import { Cache } from 'houdini/runtime/cache'
import { Writable } from 'houdini/runtime/store'
import { cacheResult } from 'houdini/runtime/cache/updates'
import { ResultState } from '../runtime/reactivity/state.svelte.js'

export const row = {
	fields: {
		tenant: { type: 'String', keyRaw: 'tenant', visible: false },
		uid: { type: 'String', keyRaw: 'uid', visible: false },
		name: { type: 'String', keyRaw: 'name', visible: true },
		email: { type: 'String', keyRaw: 'email', visible: true },
	},
}
export const selection = {
	fields: {
		users: { type: 'User', keyRaw: 'users', visible: true, nullable: true, selection: row },
	},
}
export const initial = (name = 'A') => ({
	data: {
		users: [
			{ name, email: 'a@example.com' },
			{ name: 'B', email: 'b@example.com' },
		],
	},
	fetching: false,
	errors: null,
	variables: { page: 1 },
})

export class Source extends Writable<any> {
	#result = new ResultState(
		() => this.state,
		(run) => this.subscribe(run)
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
	get variables() {
		return this.#result.get('variables')
	}
	get extra() {
		return this.#result.get('extra')
	}
	active = 0
	starts = 0
	stops = 0
	callbacks: Array<(value: any) => void> = []
	subscribe(run: (value: any) => void) {
		this.active++
		this.starts++
		this.callbacks.push(run)
		const off = super.subscribe(run)
		return () => {
			this.active--
			this.stops++
			off()
		}
	}
}

export function cacheSource() {
	const cache = new Cache({ disabled: false, types: { User: { keys: ['tenant', 'uid'] } } })
	const users = [
		{ tenant: 't', uid: 'a', name: 'A', email: 'a@example.com' },
		{ tenant: 't', uid: 'b', name: 'B', email: 'b@example.com' },
	]
	cache.write({ selection, data: { users } })
	const source = new Source({
		...initial(),
		data: cache.read({ fieldUpdates: true, selection }).data,
	})
	const spec = {
		rootType: 'Query',
		fieldUpdates: true,
		selection,
		onMessage(message: any) {
			if (message.kind === 'update')
				source.set(
					cacheResult(cache, message, {
						fetching: false,
						errors: null,
						variables: { page: 1 },
						partial: false,
						stale: false,
						source: 'cache',
					})
				)
		},
	}
	cache.subscribe(spec)
	return { cache, source, users, stop: () => cache.unsubscribe(spec) }
}
