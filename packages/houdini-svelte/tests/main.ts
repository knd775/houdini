import { flushSync, hydrate, mount, unmount } from 'svelte'
import { cacheSource, initial, row, selection, Source } from './fixtures.js'
import Harness from './Harness.svelte'
import FragmentHarness from './FragmentHarness.svelte'
import StateHarness from './StateHarness.svelte'
import { QueryStore, FragmentStore, SubscriptionStore, fragment } from '../runtime/index.js'
import { initClient } from '../runtime/client.js'
import clientCache from './clientCache.js'

declare global {
	interface Window {
		testing: any
		ssr?: { name: string; active: number }
	}
}

let component: ReturnType<typeof mount> | undefined
let control: any
let fixture: ReturnType<typeof cacheSource> | undefined
let source: Source
const counts = { name: 0, email: 0, derived: 0, list: 0 }
const target = document.querySelector('#app')!
const publish = (value: any) => {
	control = value
}
function reset() {
	for (const key of Object.keys(counts)) counts[key as keyof typeof counts] = 0
}

window.testing = {
	async state(source: any) {
		if (component) await unmount(component)
		component = mount(StateHarness, { target, props: { source } })
		flushSync()
	},
	async remount(next: any, isFragment = false) {
		if (component) await unmount(component)
		component = mount(isFragment ? FragmentHarness : Harness, {
			target,
			props: { source: next, publish, counts },
		})
		flushSync()
		await Promise.resolve()
		flushSync()
	},
	async start(useCache = true) {
		if (component) await unmount(component)
		fixture?.stop()
		fixture = useCache ? cacheSource() : undefined
		source = fixture?.source ?? new Source(initial())
		component = mount(Harness, { target, props: { source, publish, counts } })
		flushSync()
		reset()
	},
	async query() {
		const data = cacheSource()
		clientCache.write({ selection, data: { users: data.users } })
		data.stop()
		const query = new QueryStore({
			storeName: 'Users',
			variables: false,
			artifact: {
				name: 'Users',
				kind: 'HoudiniQuery',
				rootType: 'Query',
				selection,
				raw: '',
				hash: 'test',
				pluginData: {},
				stripVariables: [],
			},
		})
		component = mount(Harness, { target, props: { source: query, publish, counts } })
		await query.fetch({ variables: {} })
		flushSync()
		reset()
		return query
	},
	async fragment(size?: number, reference?: any) {
		if (component) await unmount(component)
		const fragmentSelection =
			size === undefined
				? row
				: {
						fields: {
							...row.fields,
							name: { ...row.fields.name, keyRaw: 'name(size: $size)' },
						},
					}
		const variables = size === undefined ? {} : { size }
		if (size !== undefined)
			clientCache.write({
				parent: 'User:t__a',
				selection: fragmentSelection,
				variables,
				data: { name: 'Argument' },
			})
		const store = new FragmentStore({
			storeName: 'UserFields',
			artifact: {
				name: 'UserFields',
				kind: 'HoudiniFragment',
				rootType: 'User',
				selection: fragmentSelection,
				input: { fields: { size: 'Int' }, types: {}, defaults: {} },
				raw: '',
				hash: 'test',
				pluginData: {},
				stripVariables: [],
			},
		})
		const source = fragment(
			reference === undefined ? {
				' $fragments': { values: { UserFields: { parent: 'User:t__a', variables } } },
			} : reference,
			store
		)
		component = mount(FragmentHarness, { target, props: { source, publish, counts } })
		await Promise.resolve()
		flushSync()
		reset()
		return source
	},
	async subscription() {
		if (component) await unmount(component)
		await initClient()
		const subscription = new SubscriptionStore({
			artifact: {
				name: 'UserEvents',
				kind: 'HoudiniSubscription',
				rootType: 'Subscription',
				selection,
				raw: '',
				hash: 'test',
				pluginData: {},
				stripVariables: [],
			},
		})
		component = mount(Harness, {
			target,
			props: { source: subscription, publish, counts, fetchingOnly: true },
		})
		flushSync()
		return subscription
	},
	clientCache,
	get result() {
		return control.result
	},
	get source() {
		return source
	},
	get counts() {
		return counts
	},
	get cache() {
		return fixture!.cache
	},
	get users() {
		return fixture!.users
	},
	get selection() {
		return selection
	},
	get row() {
		return row
	},
	reset,
	flush: flushSync,
	write(name: string, layer?: number) {
		fixture!.cache.write({
			parent: 'User:t__a',
			selection: { fields: { name: row.fields.name } },
			data: { name },
			layer,
		})
		flushSync()
	},
	replace(name: string) {
		const next = new Source(initial(name))
		control.replace(next)
		flushSync()
		return next
	},
	async destroy() {
		await unmount(component!)
		component = undefined
		fixture?.stop()
	},
}

if (window.ssr) {
	source = new Source(initial(window.ssr.name))
	component = hydrate(Harness, { target, props: { source, publish, counts } })
	flushSync()
	reset()
}
