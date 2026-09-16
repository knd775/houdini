import { Cache } from 'houdini/runtime/cache'
import { CachePolicy } from 'houdini/runtime/types'
import { beforeEach, expect, test, vi } from 'vitest'

import { testConfigFile } from 'houdini/test'

import { setMockConfig } from '../config'
import { HoudiniClient } from '../client.js'
import { query } from './query.js'
import { createStore, fakeFetch } from './test.js'

const config = testConfigFile()
beforeEach(async () => {
	setMockConfig(config)
})

test('resuming a query refreshes data before custom result hooks', async () => {
	const cache = new Cache({ disabled: false })
	const selection = {
		fields: { name: { type: 'String', keyRaw: 'name(locale: $locale)', visible: true } },
	}
	cache.write({ selection, variables: { locale: 'en' }, data: { name: 'Before' } })
	const transformed: unknown[] = []
	const client = new HoudiniClient({
		cache,
		plugins: [
			() => ({
				start(ctx, { next }) {
					ctx.variables = { ...ctx.variables, locale: 'en' }
					next(ctx)
				},
				end(ctx, { value, resolve }) {
					transformed.push(value.data)
					resolve(ctx, { ...value, data: { name: `${value.data?.name}!` } })
				},
			}),
			fakeFetch({ data: { name: 'Before' } }),
		],
	})
	const store = client.observe({
		fieldUpdates: true,
		artifact: {
			kind: 'HoudiniQuery',
			name: 'Transformed',
			hash: '',
			raw: '',
			rootType: 'Query',
			pluginData: {},
			stripVariables: [],
			selection,
			input: { fields: { locale: 'String' }, types: {}, defaults: {} },
		},
	})
	let stop = store.subscribe(() => {})
	await store.send({ variables: {}, policy: CachePolicy.NetworkOnly })
	expect(store.state.data).toEqual({ name: 'Before!' })
	stop()
	cache.write({ selection, variables: { locale: 'en' }, data: { name: 'While away' } })
	transformed.length = 0
	stop = store.subscribe(() => {})
	await store.send({ setup: true, variables: store.state.variables })
	expect(transformed).toEqual([{ name: 'While away' }])
	expect(store.state.data).toEqual({ name: 'While away!' })
	stop()
})

test('resuming a NoCache query retains its uncached result', async () => {
	const cache = new Cache({ disabled: false })
	const selection = { fields: { name: { type: 'String', keyRaw: 'name', visible: true } } }
	cache.write({ selection, data: { name: 'Cached' } })
	const client = new HoudiniClient({
		cache,
		plugins: [fakeFetch({ data: { name: 'Uncached' } })],
	})
	const store = client.observe({
		fieldUpdates: true,
		artifact: {
			kind: 'HoudiniQuery',
			name: 'Uncached',
			hash: '',
			raw: '',
			rootType: 'Query',
			pluginData: {},
			stripVariables: [],
			selection,
		},
	})
	let stop = store.subscribe(() => {})
	await store.send({ variables: {}, policy: CachePolicy.NoCache })
	expect(store.state.data).toEqual({ name: 'Uncached' })
	stop()
	const read = vi.spyOn(cache, 'read')
	stop = store.subscribe(() => {})
	await store.send({ setup: true, variables: store.state.variables })
	expect(store.state.data).toEqual({ name: 'Uncached' })
	expect(read).not.toHaveBeenCalled()
	stop()
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
