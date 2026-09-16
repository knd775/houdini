import { expect, it, vi } from 'vitest'
import { getRecordMetadata } from '../identity.js'
import { Cache } from '../index.js'
import {
	cacheResult,
	getCacheUpdate,
	materializeCacheResult,
	WriteNotifications,
} from '../updates.js'

const fields = { name: { type: 'String', keyRaw: 'name', visible: true } }
const selection = { fields }
const metadata = {
	fetching: false,
	errors: null,
	partial: false,
	stale: false,
	source: null,
	variables: null,
}

it('collects field changes only while an experimental subscriber is present', () => {
	const cache = new Cache({ disabled: false })
	const record = vi.spyOn(WriteNotifications.prototype, 'record')
	const legacy = { rootType: 'Query', selection, onMessage: vi.fn() }
	const experimental = { ...legacy, fieldUpdates: true, onMessage: vi.fn() }
	try {
		cache.subscribe(legacy)
		cache.write({ selection, data: { name: 'Legacy' } })
		expect(record).not.toHaveBeenCalled()
		const snapshot = legacy.onMessage.mock.calls[0][0]
		expect(Object.getOwnPropertyDescriptor(snapshot, 'data')?.get).toBeUndefined()
		expect(getCacheUpdate(cacheResult(cache, snapshot, metadata))).toBeUndefined()
		expect(getRecordMetadata(snapshot.data)).toBeUndefined()
		cache.subscribe(experimental)
		cache.write({ selection, data: { name: 'Both' } })
		expect(record).toHaveBeenCalledWith('_ROOT_', 'name')
		expect(getRecordMetadata(experimental.onMessage.mock.calls[0][0].data)?.id).toBe('_ROOT_')
		expect(getRecordMetadata(cache.read({ selection }).data!)).toBeUndefined()
		expect(getRecordMetadata(cache.read({ selection, fieldUpdates: true }).data!)?.id).toBe(
			'_ROOT_'
		)
		cache.unsubscribe(experimental)
		record.mockClear()
		cache.write({ selection, data: { name: 'Legacy again' } })
		expect(record).not.toHaveBeenCalled()
		cache.subscribe(experimental)
		cache.reset()
		record.mockClear()
		cache.write({ selection, data: { name: 'Reset' } })
		expect(record).not.toHaveBeenCalled()
	} finally {
		record.mockRestore()
	}
})

it('keeps field tracking until repeated subscriptions to a callback are all removed', () => {
	const cache = new Cache({ disabled: false })
	const record = vi.spyOn(WriteNotifications.prototype, 'record')
	const spec = { rootType: 'Query', selection, fieldUpdates: true, onMessage: vi.fn() }
	try {
		cache.subscribe(spec)
		cache.subscribe({ ...spec })
		cache.unsubscribe({ ...spec })
		cache.write({ selection, data: { name: 'Still subscribed' } })
		expect(record).toHaveBeenCalledWith('_ROOT_', 'name')
		expect(spec.onMessage).toHaveBeenCalledOnce()
		cache.unsubscribe({ ...spec })
		record.mockClear()
		cache.write({ selection, data: { name: 'Unsubscribed' } })
		expect(record).not.toHaveBeenCalled()
		expect(spec.onMessage).toHaveBeenCalledOnce()
	} finally {
		record.mockRestore()
	}
})

it('keeps ordinary subscription values as snapshots without new enumerable fields', () => {
	const cache = new Cache({ disabled: false })
	const values: any[] = []
	cache.subscribe({ rootType: 'Query', selection, onMessage: (value) => values.push(value) })
	cache.write({ selection, data: { name: 'One' } })
	cache.write({ selection, data: { name: 'Two' } })
	expect(values).toEqual([
		{ kind: 'update', data: { name: 'One' } },
		{ kind: 'update', data: { name: 'Two' } },
	])
})

it('provides field notifications without evaluating the full selection', () => {
	const cache = new Cache({ disabled: false })
	const read = vi.spyOn(cache._internal_unstable, 'getSelection')
	const values: any[] = []
	cache.subscribe({
		rootType: 'Query',
		selection,
		fieldUpdates: true,
		onMessage: (value) => values.push(value),
	})
	cache.write({ selection, data: { name: 'One' } })
	expect(read).not.toHaveBeenCalled()
	expect(values[0].fields).toEqual([{ record: '_ROOT_', key: 'name' }])
	expect(values[0].data).toEqual({ name: 'One' })
	expect(values[0].data).toEqual({ name: 'One' })
	expect(read).toHaveBeenCalledTimes(1)
})

it('discards field hints before custom hooks transform or retain results', () => {
	const cache = new Cache({ disabled: false })
	const read = vi.fn(() => ({ name: 'Original' }))
	const result = cacheResult(
		cache,
		{
			kind: 'update',
			fields: [],
			get data() {
				return read()
			},
		},
		metadata
	)
	expect(read).not.toHaveBeenCalled()
	expect(getCacheUpdate(result)).toBeDefined()
	materializeCacheResult(result)
	expect(read).toHaveBeenCalledOnce()
	expect(getCacheUpdate(result)).toBeUndefined()
	result.data = { name: 'Transformed' }
	expect(result.data).toEqual({ name: 'Transformed' })
})
