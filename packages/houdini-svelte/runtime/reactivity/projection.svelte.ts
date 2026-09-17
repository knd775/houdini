import { copyRecordMetadata, getRecordIdentity } from 'houdini/runtime/cache/identity'

import { isContainer, isStandardDate, type ResultKey } from './snapshot.js'

class Field {
	#value: unknown
	raw: unknown
	constructor(value: unknown) {
		this.#value = $state.raw(value)
		this.raw = value
	}
	read() {
		return this.#value
	}
	write(value: unknown) {
		this.raw = value
		this.#value = value
	}
}

const records = new WeakMap<object, Record<string, Field>>()
// Dates expose mutating methods even in readonly result types. Remember the
// timestamp we published so editing a returned Date cannot hide a cache update.
const dates = new WeakMap<Date, number>()
const owns = Object.prototype.hasOwnProperty
const reject = () => {
	throw new TypeError(
		'Reactive results are readonly. Use .toSorted() or .slice() to copy a list. Use a mutation or cache.write() to change cached data.'
	)
}

// Preserve native array reads and iteration, but give mutating methods useful
// advice before Object.freeze would throw an engine-specific error.
const readonlyArrayMethods = Object.fromEntries(
	['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'].map(
		(name) => [name, { value: reject, writable: true, configurable: true }]
	)
)

export function readonlyArray<T>(value: T[]): readonly T[] {
	return Object.freeze(Object.defineProperties(value, readonlyArrayMethods))
}

const recordHandler: ProxyHandler<Record<string, Field>> = {
	get(target, name, receiver) {
		// The target has no prototype and every stored entry is a Field object.
		const field = typeof name === 'string' ? target[name] : undefined
		return field ? field.read() : Reflect.get(Object.prototype, name, receiver)
	},
	getPrototypeOf: () => Object.prototype,
	has: (target, name) => owns.call(target, name) || name in Object.prototype,
	getOwnPropertyDescriptor(target, name) {
		if (typeof name !== 'string' || !owns.call(target, name)) return undefined
		return { configurable: true, enumerable: true, get: () => target[name].read(), set: reject }
	},
	set: reject,
	deleteProperty: reject,
	defineProperty: reject,
	setPrototypeOf: reject,
	preventExtensions: reject,
}

// Internal reads bypass the readonly proxy and Svelte dependency tracking.
// Public reads track only the requested field.
export function peek(value: any, field: string): any {
	const record = records.get(value)
	return record ? record[field]?.raw : value[field]
}

export function setField(value: object, field: string, next: unknown): void {
	const record = records.get(value)
	if (!record) throw new Error('Cannot update a field outside a reactive result.')
	record[field].write(next)
}

function identity(value: unknown, key: ResultKey): string | undefined {
	return isContainer(value) && !Array.isArray(value)
		? (getRecordIdentity(value) ?? key(value))
		: undefined
}

function sameShape(a: object, b: object): boolean {
	a = records.get(a) ?? a
	b = records.get(b) ?? b
	const keys = Object.keys(a)
	return keys.length === Object.keys(b).length && keys.every((name) => owns.call(b, name))
}

function equal(a: unknown, b: unknown, key: ResultKey): boolean {
	if (isStandardDate(a) && isStandardDate(b))
		return Object.is(dates.get(a) ?? a.getTime(), b.getTime())
	if (Object.is(a, b)) return true
	if (!isContainer(a) || !isContainer(b) || Array.isArray(a) !== Array.isArray(b)) return false
	if (identity(a, key) !== identity(b, key)) return false
	if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false
	return (
		sameShape(a, b) &&
		Object.keys(records.get(a) ?? a).every((name) => equal(peek(a, name), peek(b, name), key))
	)
}

// A view owns its field values independently of incoming snapshots. Records
// reject writes; membership changes replace native arrays. Scalar writes therefore
// leave all enclosing object and array references intact, while array methods
// can iterate directly without proxy traps for indices or length.
export function project(
	snapshot: any,
	visit?: (current: any, snapshot: any) => void,
	ancestors = new Set<object>()
): any {
	if (!isContainer(snapshot)) {
		if (!isStandardDate(snapshot)) return snapshot
		const value = new Date(snapshot.getTime())
		dates.set(value, value.getTime())
		return value
	}
	if (ancestors.has(snapshot)) throw new Error('Houdini cannot read a cyclic result.')
	ancestors.add(snapshot)
	try {
		const view = container(snapshot, (name) =>
			project((snapshot as any)[name], visit, ancestors)
		)
		visit?.(view, snapshot)
		return view
	} finally {
		ancestors.delete(snapshot)
	}
}

function container(snapshot: any, read: (name: string) => unknown): any {
	let view: any
	if (Array.isArray(snapshot)) {
		view = new Array(snapshot.length)
		for (const name of Object.keys(snapshot)) {
			if (name === '__proto__')
				Object.defineProperty(view, name, { value: read(name), enumerable: true })
			else view[name] = read(name)
		}
	} else {
		const fields: Record<string, Field> = Object.create(null)
		const names = Object.keys(snapshot)
		for (const name of names) fields[name] = new Field(read(name))
		view = new Proxy(fields, recordHandler)
		records.set(view, fields)
		copyRecordMetadata(snapshot, view)
	}
	return Array.isArray(view) ? readonlyArray(view) : view
}

// Reconcile against owned views using their private values without tracking.
// Reuse records by cache identity within lists and publish only changed fields.
export function reconcile(current: any, next: any, key: ResultKey): any {
	if (equal(current, next, key)) return current
	if (
		!isContainer(current) ||
		!isContainer(next) ||
		Array.isArray(current) !== Array.isArray(next) ||
		identity(current, key) !== identity(next, key)
	)
		return project(next)

	if (Array.isArray(next) && Array.isArray(current)) {
		const byKey = new Map<string, number[]>()
		current.forEach((item, index) => {
			const id = identity(item, key)
			if (id !== undefined) {
				const indices = byKey.get(id) ?? []
				indices.push(index)
				byKey.set(id, indices)
			}
		})
		const values = Object.keys(next).map((name) => {
			const item = (next as any)[name]
			let oldName = name
			if (/^(0|[1-9]\d*)$/.test(name)) {
				const id = identity(item, key)
				if (id !== undefined) {
					const index = byKey.get(id)?.shift()
					if (index === undefined) return [name, project(item)] as const
					oldName = String(index)
				}
			}
			return [
				name,
				owns.call(current, oldName)
					? reconcile((current as any)[oldName], item, key)
					: project(item),
			] as const
		})
		if (
			current.length === next.length &&
			sameShape(current, next) &&
			values.every(([name, value]) => Object.is((current as any)[name], value))
		)
			return current
		const lookup = Object.fromEntries(values)
		return container(next, (name) => lookup[name])
	}

	const shapeChanged = !sameShape(current, next)
	const values: Array<readonly [string, unknown]> = []
	for (const name of Object.keys(next)) {
		const hadField = owns.call(records.get(current) ?? current, name)
		const value = hadField
			? reconcile(peek(current, name), (next as any)[name], key)
			: project((next as any)[name])
		if (shapeChanged) values.push([name, value])
		else if (!Object.is(peek(current, name), value)) setField(current, name, value)
	}
	if (!shapeChanged) return current
	const lookup = Object.fromEntries(values)
	return container(next, (name) => lookup[name])
}
