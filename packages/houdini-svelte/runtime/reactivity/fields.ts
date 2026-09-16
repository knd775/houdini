import { getRecordMetadata } from 'houdini/runtime/cache/identity'
import { evaluateKey } from 'houdini/runtime/cache/stuff'
import type { CacheUpdate } from 'houdini/runtime/cache/updates'
import type { SubscriptionSelection } from 'houdini/runtime/types'
import { peek, reconcile, setField } from './projection.svelte.js'
import { capture, isContainer, type ResultKey } from './snapshot.js'

const owns = Object.prototype.hasOwnProperty
type RecordTarget = {
	current: Record<string, unknown>
	fields: NonNullable<SubscriptionSelection['fields']>
	variables: {} | null | undefined
}

// Index selected record occurrences once. Resolve their field names only when
// a write arrives; allocating a map and target array for every scalar made
// initial reads expensive even when most records never changed.
export class FieldIndex {
	#records = new Map<string, RecordTarget[]>()
	#complete = true

	constructor(current?: unknown, snapshot?: unknown) {
		const visit = (current: any, snapshot: any) => {
			if (!isContainer(snapshot)) return
			if (Array.isArray(snapshot)) {
				snapshot.forEach((value, index) => {
					visit(current[index], value)
				})
				return
			}
			const fields = this.add(current, snapshot)
			if (!fields) return
			for (const [name, field] of Object.entries(fields)) {
				if (field.selection && isContainer(snapshot[name]))
					visit(peek(current, name), snapshot[name])
			}
		}
		visit(current, snapshot)
	}

	// Initial projection registers records as it creates them, avoiding a second
	// tree walk. Full reconciliation uses the constructor's traversal to reindex.
	add = (current: any, snapshot: any) => {
		const record = getRecordMetadata(snapshot)
		if (record?.hasNullBubble) this.#complete = false
		if (!record?.fields) return
		const fields = record.fields
		const targets = this.#records.get(record.id) ?? []
		targets.push({ current, fields, variables: record.variables })
		this.#records.set(record.id, targets)
		return fields
	}

	apply(update: CacheUpdate, key: ResultKey): boolean {
		if (!update.fields?.length || !this.#complete || !this.#records.size) return false
		const changes: Array<{ target: RecordTarget; name: string; value: unknown }> = []
		for (const { record, key: fieldKey } of update.fields) {
			if (fieldKey === '__typename') return false
			const targets = this.#records.get(record)
			if (!targets) return false
			for (const target of targets)
				for (const [name, field] of Object.entries(target.fields)) {
					if (
						!owns.call(target.current, name) ||
						evaluateKey(field.keyRaw, target.variables) !== fieldKey
					)
						continue
					// Relationships affect identity, ordering, and null propagation.
					if (field.selection) return false
					const data = update.cache.read({
						parent: record,
						selection: { fields: { [name]: field } },
						variables: target.variables,
					}).data
					if (!data) return false
					changes.push({ target, name, value: capture(data[name]) })
				}
		}
		// Validate the complete batch before publishing any signal changes.
		for (const {
			target: { current },
			name,
			value,
		} of changes) {
			const previous = peek(current, name)
			const next = reconcile(previous, value, key)
			if (!Object.is(previous, next)) setField(current, name, next)
		}
		return true
	}
}
