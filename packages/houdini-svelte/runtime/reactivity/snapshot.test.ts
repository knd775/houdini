import { Cache } from 'houdini/runtime/cache'
import {
	getRecordIdentity,
	getRecordMetadata,
	markNullBubble,
	setRecordMetadata,
} from 'houdini/runtime/cache/identity'
import { describe, expect, it } from 'vitest'
import { project, reconcile } from './projection.svelte.js'
import { capture } from './snapshot.js'

const key = (value: Readonly<Record<string, unknown>>) =>
	typeof value.id === 'string' ? value.id : undefined
const apply = (before: any, after: any) => reconcile(project(before), after, key) as any

describe('result snapshots', () => {
	it('reconciles owned views after the source is mutated and re-emitted', () => {
		const source = { rows: [{ n: 1 }], dates: [new Date(0)] }
		const current = project(source)
		source.rows[0].n = 2
		current.dates[0].setTime(100)
		source.dates[0].setTime(100)
		const oldDate = current.dates[0]
		expect(current.rows[0].n).toBe(1)
		expect(reconcile(current, source, key)).toBe(current)
		expect(current.rows[0].n).toBe(2)
		expect(current.dates[0]).not.toBe(oldDate)
		expect(current.dates[0]).not.toBe(source.dates[0])
		expect(current.dates[0].getTime()).toBe(100)
	})
	it('owns snapshots, including when a store reuses and edits its object', () => {
		const source = { list: [{ id: 'a', name: 'Before' }], date: new Date(0) }
		const current = project(source) as typeof source
		source.list[0].name = 'After'
		source.date.setTime(100)
		expect(reconcile(current, source, key)).toBe(current)
		expect(current.list[0].name).toBe('After')
		expect(current.date.getTime()).toBe(100)
		expect(current.date).not.toBe(source.date)
	})
	it('preserves records through reorder, insert, delete and duplicate occurrences', () => {
		const initial = [
			{ id: 'a', v: 1 },
			{ id: 'a', v: 1 },
			{ id: 'b', v: 2 },
		]
		let current = project(initial) as typeof initial
		const [a1, a2, b] = current
		const next = [
			{ id: 'b', v: 3 },
			{ id: 'a', v: 4 },
			{ id: 'a', v: 4 },
			{ id: 'c', v: 5 },
		]
		const original = current
		current = reconcile(current, next, key)
		expect(current).not.toBe(original)
		expect(Object.isFrozen(current)).toBe(true)
		expect(current[0]).toBe(b)
		expect(current[1]).toBe(a1)
		expect(current[2]).toBe(a2)
		expect(a1).not.toBe(a2)
		current = reconcile(current, [next[1]], key)
		expect(current).toEqual([{ id: 'a', v: 4 }])
		expect(current[0]).toBe(a1)
	})
	it('handles nulls, absent keys, explicit undefined and list metadata', () => {
		expect(apply({ a: null }, { a: { x: 1 } })).toEqual({ a: { x: 1 } })
		expect(apply({ a: { x: 1 } }, { a: null })).toEqual({ a: null })
		expect(apply({ a: 1 }, {})).toEqual({})
		expect(Object.keys(apply({}, { a: undefined }))).toContain('a')
		const before = Object.assign([{ id: 'a' }], { __id: 'list-a' })
		const after = Object.assign([{ id: 'a' }, { id: 'b' }], { __id: 'list-b' })
		expect(apply(before, after)).toEqual(after)
	})
	it('keeps arrays stable for scalar edits and replaces changed membership or object keys', () => {
		const before = { list: [{ id: 'a', n: 1 }] }
		const current = project(before)
		const list = current.list
		const row = list[0]
		const after = { list: [{ id: 'a', n: 2 }] }
		expect(reconcile(current, after, key)).toBe(current)
		expect(current.list).toBe(list)
		expect(current.list[0]).toBe(row)
		expect(row.n).toBe(2)
		const extended = { list: [{ id: 'a', n: 2, extra: undefined }] }
		reconcile(current, extended, key)
		expect(current.list).not.toBe(list)
		expect(current.list[0]).not.toBe(row)
		expect(Object.keys(current.list[0])).toEqual(['id', 'n', 'extra'])
		expect(Object.keys(row)).toEqual(['id', 'n'])
	})
	it('preserves sparse arrays and treats inherited property names as new data', () => {
		const next = new Array(3)
		next[1] = undefined
		Object.defineProperty(next, '__proto__', { value: [], enumerable: true })
		const result = apply([], next)
		expect(result.length).toBe(3)
		expect(Object.keys(result)).toEqual(['1', '__proto__'])
		expect(result.__proto__).not.toBe(Array.prototype)
		expect(Object.isFrozen(result.__proto__)).toBe(true)
		expect(Object.getPrototypeOf(result)).toBe(Array.prototype)
	})
	it('uses opaque cache IDs even with masked keys and identical visible fields', () => {
		const a = { name: 'Same' },
			b = { name: 'Same' }
		setRecordMetadata(a, { id: 'User:a' })
		setRecordMetadata(b, { id: 'User:b' })
		const old = [a, b]
		let current = project(old) as typeof old
		const [first, second] = current
		current = reconcile(current, [b, a], key)
		expect(current[0]).toBe(second)
		expect(current[1]).toBe(first)
	})
	it('keeps independent result projections and opaque scalar instances', () => {
		class Money {
			constructor(public amount: number) {}
		}
		const money = new Money(4)
		const source = { id: 'a', money, n: 1 }
		const one = project(source) as typeof source,
			two = project(source) as typeof source
		reconcile(one, { ...source, n: 2 }, key)
		expect(two.n).toBe(1)
		expect(one.money).toBe(money)
	})
	it('replaces Date subclasses even when their timestamps match', () => {
		class ZonedDate extends Date {
			constructor(
				time: number,
				public zone: string
			) {
				super(time)
			}
		}
		const before = { date: new ZonedDate(100, 'UTC') }
		const after = { date: new ZonedDate(100, 'America/New_York') }
		const current = project(before)
		expect(reconcile(current, after, key)).toBe(current)
		expect(current.date).toBe(after.date)
		expect(current.date.zone).toBe('America/New_York')
		const standard = { date: new Date(100) }
		reconcile(current, standard, key)
		expect(Object.getPrototypeOf(current.date)).toBe(Date.prototype)
		const unchanged = current.date
		reconcile(current, { date: new Date(100) }, key)
		expect(current.date).toBe(unchanged)
	})
	it('rejects cycles but accepts repeated references in a tree', () => {
		const cycle: any = {}
		cycle.self = cycle
		expect(() => capture(cycle)).toThrow('cyclic')
		expect(() => project(cycle)).toThrow('cyclic')
		const shared = { n: 1 }
		expect(capture([shared, shared])).toEqual([{ n: 1 }, { n: 1 }])
		expect(project([shared, shared])).toEqual([{ n: 1 }, { n: 1 }])
	})
	it('preserves arbitrary JSON scalar keys without changing object prototypes', () => {
		const next = JSON.parse('{"__proto__":{"value":1}}')
		const result = apply({}, next)
		expect(Object.keys(result)).toEqual(['__proto__'])
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
		expect(result.__proto__).toEqual({ value: 1 })
		expect(apply(next, JSON.parse('{"__proto__":null}')).__proto__).toBe(null)
	})
	it('reads falsy fields that shadow object members and preserves inherited property behavior', () => {
		const source = JSON.parse(
			'{"__proto__":null,"constructor":false,"toString":0,"hasOwnProperty":""}'
		)
		source.missingValue = undefined
		const current = project(source)
		for (const name of Object.keys(source)) {
			expect(Object.hasOwn(current, name)).toBe(true)
			expect(current[name]).toBe(source[name])
		}
		expect(Object.getPrototypeOf(current)).toBe(Object.prototype)
		expect(current[Symbol.toStringTag]).toBeUndefined()
		expect(Object.prototype.toString.call(current)).toBe('[object Object]')

		const empty = project({})
		expect(empty.constructor).toBe(Object)
		expect(empty.toString).toBe(Object.prototype.toString)
		expect(empty.hasOwnProperty('toString')).toBe(false)
		expect(empty.unknown).toBeUndefined()
		expect(empty[Symbol.iterator]).toBeUndefined()
		expect(empty.__proto__).toBe(Object.prototype)
		// Inherited accessors must still receive the actual receiver.
		expect(Object.create(empty).__proto__).toBe(empty)
	})
	it('exposes readonly objects, arrays and descriptor values with stable identities', () => {
		const current = project({ list: [{ n: 1 }] })
		expect(current.list).toBe(current.list)
		expect(() => {
			;(current.list[0] as any).n = 2
		}).toThrow(TypeError)
		expect(() => {
			;(current.list as any).push({ n: 2 })
		}).toThrow(TypeError)
		expect(() => {
			delete (current as any).list
		}).toThrow(TypeError)
		expect(() => {
			Object.defineProperty(current, 'x', { value: 1 })
		}).toThrow(TypeError)
		expect(() => {
			const descriptor = Object.getOwnPropertyDescriptor(current, 'list')!
			;(descriptor.get ? descriptor.get.call(current) : descriptor.value)[0].n = 2
		}).toThrow(TypeError)
		expect(JSON.stringify(current)).toBe('{"list":[{"n":1}]}')
	})
})

it('cache identity survives masked/custom keys without changing JSON or own keys', () => {
	const cache = new Cache({ disabled: false, types: { User: { keys: ['tenant', 'uuid'] } } })
	const selection = {
		fields: {
			users: {
				type: 'User',
				keyRaw: 'users',
				visible: true,
				selection: {
					fields: {
						tenant: { type: 'String', keyRaw: 'tenant', visible: false },
						uuid: { type: 'String', keyRaw: 'uuid', visible: false },
						label: { type: 'String', keyRaw: 'name', visible: true },
					},
				},
			},
		},
	}
	cache.write({ selection, data: { users: [{ tenant: 't', uuid: 'a', label: 'A' }] } })
	const value = cache.read({ fieldUpdates: true, selection }).data as any
	expect(value).toEqual({ users: [{ label: 'A' }] })
	expect(Reflect.ownKeys(value.users[0])).toEqual(['label'])
	expect(getRecordIdentity(value.users[0])).toBe('User:t__a')
	expect(getRecordIdentity((capture(value) as any).users[0])).toBe('User:t__a')
	expect(JSON.parse(JSON.stringify(value))).toEqual(value)
})

it('preserves null-propagation metadata without sharing flags between snapshots and views', () => {
	const source = { name: 'A' }
	setRecordMetadata(source, { id: 'User:1' })
	const snapshot = capture(source) as object
	const current = project(source)
	markNullBubble(source)
	expect(getRecordMetadata(snapshot)?.hasNullBubble).toBeUndefined()
	expect(getRecordMetadata(current)?.hasNullBubble).toBeUndefined()
	expect(getRecordMetadata(capture(source) as object)?.hasNullBubble).toBe(true)
	expect(getRecordMetadata(project(source))?.hasNullBubble).toBe(true)
})
