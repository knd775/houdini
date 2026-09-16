import { flushSync, mount, unmount } from 'svelte'
import { fragment, FragmentStore, QueryStore } from '../runtime/index.js'
import { getRecordMetadata } from 'houdini/runtime/cache/identity'
import LegacyHarness from './LegacyHarness.svelte'
import cache from './clientCache.js'

const fields = {
	tenant: { type: 'String', keyRaw: 'tenant', visible: false },
	uid: { type: 'String', keyRaw: 'uid', visible: false },
	name: { type: 'String', keyRaw: 'name', visible: true },
}
const selection = {
	fields: {
		users: {
			type: 'User',
			keyRaw: 'users',
			visible: true,
			selection: { fields },
		},
	},
}
const active = new Set()
const subscribe = cache.subscribe.bind(cache)
const unsubscribe = cache.unsubscribe.bind(cache)
const fieldModes: boolean[] = []
cache.subscribe = (spec, ...args) => {
	active.add(spec)
	fieldModes.push(!!spec.fieldUpdates)
	return subscribe(spec, ...args)
}
cache.unsubscribe = (spec, ...args) => {
	active.delete(spec)
	return unsubscribe(spec, ...args)
}
cache.write({ selection, data: { users: [{ tenant: 't', uid: 'a', name: 'Before' }] } })
const artifact = {
	name: 'Users',
	kind: 'HoudiniQuery' as const,
	rootType: 'Query',
	selection,
	raw: '',
	hash: 'legacy',
	pluginData: {},
	stripVariables: [],
	policy: 'CacheOnly' as const,
}
const query = new QueryStore({ storeName: 'Users', variables: true, artifact })
await query.fetch({ variables: {} })
const store = new FragmentStore({
	storeName: 'UserFields',
	artifact: {
		...artifact,
		name: 'UserFields',
		kind: 'HoudiniFragment',
		rootType: 'User',
		selection: { fields },
	},
})
const row = fragment(
	{
		' $fragments': {
			values: {
				UserFields: { parent: 'User:t__a', variables: {} },
			},
		},
	} as any,
	store
)
const snapshots: any[] = []
const stop = query.subscribe((value) => snapshots.push(value))
const component = mount(LegacyHarness, {
	target: document.querySelector('#app')!,
	props: { query, row },
})
flushSync()
await Promise.resolve()
flushSync()

;(window as any).legacyTesting = {
	update(name: string) {
		cache.write({ parent: 'User:t__a', selection: { fields }, data: { name } })
		flushSync()
	},
	inspect() {
		return {
			variables: query.variables,
			directData: 'data' in query,
			requiresVariables: 'requiresVariables' in query,
			fragmentReadable: typeof row.data.subscribe === 'function',
			snapshots: snapshots.map((value) => value.data.users[0].name),
			metadata: !!getRecordMetadata(cache.read({ selection }).data!.users[0]),
			fieldModes,
			active: active.size,
		}
	},
	async destroy() {
		stop()
		await unmount(component)
		await Promise.resolve()
		flushSync()
		return active.size
	},
}
