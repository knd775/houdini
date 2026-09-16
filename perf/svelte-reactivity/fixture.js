import { Cache } from '../../packages/houdini/src/runtime/cache/index.ts'
import { Writable } from '../../packages/houdini/src/runtime/store.ts'
import { ReactiveResult } from './result.svelte.js'
import { ResultState } from '../../packages/houdini-svelte/runtime/reactivity/state.svelte.ts'
import { cacheResult } from '../../packages/houdini/src/runtime/cache/updates.ts'

class FieldStore extends Writable {
	result = new ResultState(() => this.state, this.subscribe.bind(this))
	get data() {
		return this.result.get('data')
	}
}

const field = (type, keyRaw, visible = true) => ({ type, keyRaw, visible })
export const rowSelection = {
	fields: {
		__typename: field('String', '__typename'),
		id: field('ID', 'id'),
		name: field('String', 'name'),
		email: field('String', 'email'),
	},
}
export const tableSelection = {
	fields: {
		users: { ...field('User', 'users'), selection: rowSelection },
	},
}
const parentSelection = {
	fields: {
		users: {
			...field('User', 'users'),
			selection: {
				fields: {
					...rowSelection.fields,
					name: field('String', 'name', false),
					email: field('String', 'email', false),
				},
			},
		},
	},
}
const nameSelection = { fields: { name: rowSelection.fields.name } }

export function makeFixture(mode, size) {
	const cache = new Cache({ disabled: false })
	cache.write({
		selection: tableSelection,
		data: {
			users: Array.from({ length: size }, (_, index) => ({
				__typename: 'User',
				id: String(index),
				name: `Name ${index}`,
				email: `user${index}@example.com`,
			})),
		},
	})
	const initial = cache.read({ selection: tableSelection, fieldUpdates: mode === 'runtime' }).data
	const identity = (value) =>
		value?.__typename && value.id != null
			? cache._internal_unstable.id(value.__typename, value)
			: undefined
	const result = mode === 'reconciled' ? new ReactiveResult(initial, identity) : null
	const store =
		mode === 'runtime' ? new FieldStore({ data: initial }) : new Writable({ data: initial })
	const rows = new Map()
	const specs = []
	const stats = {
		enabled: false,
		lists: 0,
		derived: 0,
		names: 0,
		emails: 0,
		mounts: 0,
		unmounts: 0,
	}
	const metrics = { adapterMs: 0, notifications: 0 }
	function listen(selection, parentID, apply) {
		const spec = {
			fieldUpdates: mode === 'runtime',
			rootType: parentID ? 'User' : 'Query',
			parentID,
			selection,
			onMessage(message) {
				if (message.kind !== 'update') return
				metrics.notifications++
				const start = performance.now()
				apply(mode === 'runtime' ? message : message.data)
				metrics.adapterMs += performance.now() - start
			},
		}
		cache.subscribe(spec)
		specs.push(spec)
	}
	if (mode === 'fragments') {
		// Same cache subscription boundaries as a masked table + row fragments.
		// The generated fragment helpers and their metadata are not exercised here.
		store.set({ data: cache.read({ selection: parentSelection }).data })
		listen(parentSelection, undefined, (data) => store.set({ data }))
		for (const row of initial.users) {
			const rowStore = new Writable(row)
			rows.set(row.id, rowStore)
			listen(rowSelection, identity(row), (data) => rowStore.set(data))
		}
	} else {
		listen(tableSelection, undefined, (data) => {
			if (mode === 'runtime')
				store.set(
					cacheResult(cache, data, {
						fetching: false,
						errors: null,
						variables: null,
						partial: false,
						stale: false,
						source: 'cache',
					})
				)
			else if (result) result.apply(data)
			else store.set({ data })
		})
	}
	return {
		mode,
		cache,
		store,
		rows,
		result,
		stats,
		metrics,
		write(index, name, layer) {
			cache.write({
				parent: `User:${index}`,
				selection: nameSelection,
				data: { name },
				layer,
			})
		},
		dispose() {
			for (const spec of specs) cache.unsubscribe(spec)
		},
	}
}
