import { Cache } from 'houdini/runtime/cache'
import { CachePolicy, type QueryArtifact } from 'houdini/runtime/types'
import { beforeEach, expect, test, vi } from 'vitest'

import { testConfigFile } from 'houdini/test'

import { HoudiniClient } from '../client.js'
import { setMockConfig } from '../config'
import { query } from './query.js'
import { createStore, fakeFetch } from './test.js'

const config = testConfigFile()
beforeEach(async () => {
	setMockConfig(config)
})

test('refetch triggered by cache.refresh uses the most recent session, not the subscription-time session', async () => {
	const cache = new Cache()

	// write a record so the subscription has something to attach to
	const selection = {
		fields: {
			viewer: {
				type: 'User',
				visible: true,
				keyRaw: 'viewer',
				selection: {
					fields: {
						id: { type: 'ID', visible: true, keyRaw: 'id' },
						firstName: { type: 'String', visible: true, keyRaw: 'firstName' },
					},
				},
			},
		},
	}

	cache.write({
		selection,
		data: { viewer: { id: '1', firstName: 'bob' } },
	})

	// spy to capture every network request and the session it carries
	const fetchSpy = vi.fn()

	const store = createStore({
		artifact: {
			kind: 'HoudiniQuery',
			hash: '7777',
			raw: 'RAW_TEXT',
			name: 'TestArtifact',
			rootType: 'Query',
			pluginData: {},
			stripVariables: [],
			selection,
		},
		pipeline: [query(cache), fakeFetch({ spy: fetchSpy })],
	})

	// first send — establishes the cache subscription with session 'old'
	await store.send({ session: { token: 'old' }, variables: {} })

	// second send with the same variables but a new session — no new subscription is created
	// but lastSession in the closure must be updated to 'new'
	await store.send({ session: { token: 'new' }, variables: {} })

	// reset the spy so we only see the refetch request
	fetchSpy.mockClear()

	// trigger a refetch via the cache
	cache.refresh('User:1')

	// give the async send a tick to run
	await new Promise((r) => setTimeout(r, 0))

	// the refetch must carry the new session, not the stale one from subscription time
	expect(fetchSpy).toHaveBeenCalledOnce()
	expect(fetchSpy.mock.calls[0][0].session).toEqual({ token: 'new' })
})

test('query plugin evaluates runtime scalars', async () => {
	const fetchSpy = vi.fn()

	const cache = new Cache()

	const store = createStore({
		artifact: {
			kind: 'HoudiniQuery',
			hash: '7777',
			raw: 'RAW_TEXT',
			name: 'TestArtifact',
			rootType: 'Query',
			pluginData: {},
			enableLoadingState: 'local',
			input: {
				fields: {
					id: 'ID',
				},
				types: {},
				defaults: {},
				runtimeScalars: {
					id: 'ViewerIDFromSession',
				},
			},
			selection: {
				fields: {
					viewer: {
						type: 'User',
						visible: true,
						keyRaw: 'viewer',
						loading: { kind: 'continue' },
						selection: {
							fields: {
								id: {
									type: 'ID',
									visible: true,
									keyRaw: 'id',
								},
								firstName: {
									type: 'String',
									visible: true,
									keyRaw: 'firstName',
									loading: { kind: 'value' },
								},
								__typename: {
									type: 'String',
									visible: true,
									keyRaw: '__typename',
								},
							},
						},
					},
				},
			},
		},
		pipeline: [query(cache), fakeFetch({ spy: fetchSpy })],
	})

	// run the query with an artifact that contains runtime scalars
	await store.send({ session: { token: 'world' } })

	// the fetch spy should
	const ctx = fetchSpy.mock.calls[0][0]

	expect(ctx.variables).toEqual({ id: 'world' })
})

const logArtifact = {
	kind: 'HoudiniQuery',
	hash: '8888',
	raw: 'RAW_TEXT',
	name: 'LogArtifact',
	rootType: 'Query',
	pluginData: {},
	stripVariables: [],
	input: { fields: { logId: 'Int' }, types: {}, defaults: {}, runtimeScalars: {} },
	selection: {
		fields: {
			log: {
				type: 'Log',
				visible: true,
				keyRaw: 'log(id: $logId)',
				selection: {
					fields: {
						id: { type: 'ID', visible: true, keyRaw: 'id' },
						__typename: { type: 'String', visible: true, keyRaw: '__typename' },
					},
				},
			},
		},
	},
} as const satisfies QueryArtifact

function logClient() {
	const cache = new Cache()
	const fetchSpy = vi.fn()
	const client = new HoudiniClient({
		cache,
		pipeline: [
			query(cache),
			fakeFetch({ spy: fetchSpy, data: { log: { id: '1', __typename: 'Log' } } }),
		],
	})

	// rotate the session and collect the variables of every request it triggers
	const refetchedVariables = async () => {
		fetchSpy.mockClear()
		cache.refreshAll({ token: 'rotated' })
		await new Promise((r) => setTimeout(r, 0))
		return fetchSpy.mock.calls.map(([ctx]) => ctx.variables)
	}

	return { client, refetchedVariables }
}

test('refreshAll skips a query store that was subscribed but never fetched', async () => {
	const { client, refetchedVariables } = logClient()

	// a component that reads the store but never fetches it (svelte sends a setup pass
	// with the store's variables, which are still null)
	const unfetched = client.observe({ artifact: logArtifact })
	unfetched.subscribe(() => {})
	await unfetched.send({ setup: true, variables: null })

	const fetched = client.observe({ artifact: logArtifact })
	fetched.subscribe(() => {})
	await fetched.send({ variables: { logId: 42 } })

	expect(await refetchedVariables()).toEqual([{ logId: 42 }])
})

test('refreshAll refetches a store set up with the variables the server used', async () => {
	const { client, refetchedVariables } = logClient()

	// react sets up a store with the variables its server-rendered data used, before the
	// store has resolved anything
	const store = client.observe({ artifact: logArtifact })
	store.subscribe(() => {})
	await store.send({ setup: true, variables: { logId: 7 } })

	expect(await refetchedVariables()).toEqual([{ logId: 7 }])
})

test('a query store that was cleaned up and fetched again refetches with its new variables', async () => {
	const { client, refetchedVariables } = logClient()

	const store = client.observe({ artifact: logArtifact })
	const unsubscribe = store.subscribe(() => {})
	await store.send({ variables: { logId: 1 } })

	// losing the last subscriber cleans up the plugins
	unsubscribe()

	store.subscribe(() => {})
	await store.send({ variables: { logId: 2 } })

	expect(await refetchedVariables()).toEqual([{ logId: 2 }])
})

test('refreshAll refetches a never-fetched store whose query takes no arguments', async () => {
	const { client, refetchedVariables } = logClient()

	const store = client.observe({ artifact: { ...logArtifact, input: undefined } })
	store.subscribe(() => {})
	await store.send({ setup: true, variables: null })

	expect(await refetchedVariables()).toEqual([{}])
})
