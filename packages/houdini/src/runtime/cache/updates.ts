import type { CacheMessage, ChangedField, QueryResult, SubscriptionSpec } from '../types.js'
import type { Cache } from './index.js'

// The same set travels through nested writes and list operations. Recording a
// field here preserves the information that would otherwise be lost when we
// reduce a write to a set of document subscribers.
export class WriteNotifications extends Set<SubscriptionSpec> {
	complete = true
	readonly fields = new Map<string, Set<string>>()
	record(record: string, key: string) {
		let keys = this.fields.get(record)
		if (!keys) {
			keys = new Set()
			this.fields.set(record, keys)
		}
		keys.add(key)
	}
	changes(): ChangedField[] | undefined {
		if (!this.complete) return undefined
		return [...this.fields].flatMap(([record, keys]) =>
			[...keys].map((key) => ({ record, key }))
		)
	}
}

export type CacheUpdate = {
	cache: Cache
	fields: readonly ChangedField[] | undefined
}

const updates = new WeakMap<object, CacheUpdate>()

export function getCacheUpdate(value: object): CacheUpdate | undefined {
	return updates.get(value)
}

export function materializeCacheResult(value: QueryResult): void {
	void value.data
	// A custom hook can transform the data. Its result must be read in full.
	updates.delete(value)
}

// Keep the snapshot lazy through the client pipeline. Normal subscribers and
// plugins can read data as before; a field-aware consumer can avoid that read.
export function cacheResult(
	cache: Cache,
	message: Extract<CacheMessage, { kind: 'update' }>,
	metadata: Omit<QueryResult, 'data'>
): QueryResult {
	// Ordinary cache notifications already contain a snapshot. Preserve that
	// result shape without allocating lazy getters or field-update metadata.
	if (!('fields' in message)) return { ...metadata, data: message.data }
	let overridden = false
	let data: QueryResult['data'] = null
	const result = {
		...metadata,
		get data() {
			return overridden ? data : message.data
		},
		set data(value: QueryResult['data']) {
			overridden = true
			data = value
			updates.delete(result)
		},
	}
	updates.set(result, { cache, fields: message.fields })
	return result
}
