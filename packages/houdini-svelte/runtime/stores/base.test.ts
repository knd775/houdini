import type { QueryArtifact } from 'houdini/runtime'
import { Writable } from 'houdini/runtime/store'
import { beforeEach, expect, it, vi } from 'vitest'
import { BaseStore } from './base.js'

const client = vi.hoisted(() => ({ get: vi.fn(), init: vi.fn() }))
vi.mock('../client.js', () => ({ getClient: client.get, initClient: client.init }))
const artifact = {
	name: 'Test',
	kind: 'HoudiniQuery',
	selection: {},
	rootType: 'Query',
} as QueryArtifact
const result = (n: number) => ({
	data: { n },
	fetching: false,
	errors: null,
	partial: false,
	stale: false,
	source: null,
	variables: null,
})
let observer: Writable<ReturnType<typeof result>> & { send: ReturnType<typeof vi.fn> }
let stopped: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
	stopped = vi.fn()
	const writable = new Writable(result(1), () => stopped)
	observer = Object.assign(writable, {
		send: vi.fn(),
		subscribeUpdates: writable.subscribe.bind(writable),
	})
	client.get.mockReset().mockReturnValue({ observe: () => observer })
	client.init.mockReset().mockResolvedValue(undefined)
})

it('removes each callback while preserving the other subscribers', async () => {
	const store = new BaseStore({ artifact, initialize: false })
	const a = vi.fn(),
		b = vi.fn()
	const stopA = store.subscribe(a),
		stopB = store.subscribe(b)
	await Promise.resolve()
	a.mockClear()
	b.mockClear()
	stopA()
	stopA()
	observer.set(result(2))
	expect(a).not.toHaveBeenCalled()
	expect(b).toHaveBeenCalledWith(result(2))
	expect(stopped).not.toHaveBeenCalled()
	stopB()
	expect(stopped).toHaveBeenCalledOnce()
})

it('does not attach an observer after the last listener leaves during client initialization', async () => {
	let ready!: () => void
	client.get.mockImplementationOnce(() => {
		throw new Error('not ready')
	})
	client.init.mockReturnValue(
		new Promise<void>((resolve) => {
			ready = resolve
		})
	)
	const store = new BaseStore({ artifact })
	const stop = store.subscribe(() => {})
	stop()
	ready()
	await Promise.resolve()
	expect(observer.send).not.toHaveBeenCalled()
	expect(client.get).toHaveBeenCalledTimes(1)
	const later = store.subscribe(() => {})
	await Promise.resolve()
	expect(observer.send).toHaveBeenCalledOnce()
	later()
	expect(stopped).toHaveBeenCalledOnce()
})
