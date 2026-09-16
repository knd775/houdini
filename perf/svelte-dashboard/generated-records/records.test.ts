import { expect, it } from 'vitest'
import { createGeneratedRecord, generatedRecords } from 'benchmark:generated-records'
import { setRecordMetadata } from 'houdini/runtime/cache/identity'
import { project, reconcile } from '../../../packages/houdini-svelte/runtime/reactivity/projection.svelte.js'
import { recordShapes } from './generate.mjs'

it('uses generated classes through the normal projection and update path', () => {
	const current = project({ users: [{ name: 'A', email: 'a@example.com' }] })
	expect(generatedRecords.has(current)).toBe(true)
	expect(generatedRecords.has(current.users[0])).toBe(true)
	expect(Object.getPrototypeOf(current.users[0])).toBe(Object.prototype)
	expect(Object.keys(current.users[0])).toEqual(['name', 'email'])
	expect(Object.isFrozen(current.users[0])).toBe(true)
	const row = current.users[0]
	reconcile(current, { users: [{ name: 'B', email: 'a@example.com' }] }, () => undefined)
	expect(current.users[0]).toBe(row)
	expect(row.name).toBe('B')
	expect(JSON.stringify(current)).toBe('{"users":[{"name":"B","email":"a@example.com"}]}')
})

it('falls back for additional, missing or reordered keys without losing fields', () => {
	const selection = { fields: { name: { type: 'String', keyRaw: 'name', visible: true } } }
	const before = { name: 'A' }
	setRecordMetadata(before, { id: 'User:1', fields: selection.fields })
	const current = project(before)
	expect(generatedRecords.has(current)).toBe(true)
	const after = { email: 'a@example.com', name: 'B', extra: undefined }
	setRecordMetadata(after, { id: 'User:1', fields: selection.fields })
	const next = reconcile(current, after, () => undefined)
	expect(generatedRecords.has(next)).toBe(false)
	expect(Object.keys(next)).toEqual(['email', 'name', 'extra'])
	expect(next).toEqual(after)
	expect(reconcile(next, before, () => undefined)).toEqual(before)
})

it('keeps descriptor access readonly without leaking private rune or raw fields', () => {
	const source = JSON.parse('{"constructor":"value","toString":"text","__proto__":{"value":1}}')
	const current = project(source)
	expect(generatedRecords.has(current)).toBe(true)
	expect(Object.getPrototypeOf(current)).toBe(Object.prototype)
	expect(Reflect.ownKeys(current)).toEqual(['constructor', 'toString', '__proto__'])
	expect({ ...current }).toEqual(source)
	const descriptor = Object.getOwnPropertyDescriptor(current, 'constructor')!
	expect(descriptor.get!.call(current)).toBe('value')
	expect(() => descriptor.set!.call(current, 'changed')).toThrow(TypeError)
	expect(() => Object.setPrototypeOf(current, null)).toThrow(TypeError)
	expect(() => Object.defineProperty(current, 'extra', { value: 1 })).toThrow(TypeError)
	expect(() => delete current.toString).toThrow(TypeError)
})

it('shares descriptors across instances while keeping their values independent', () => {
	const a = project({ name: 'A', email: 'a' })
	const b = project({ name: 'B', email: 'b' })
	expect(Object.getOwnPropertyDescriptor(a, 'name')!.get)
		.toBe(Object.getOwnPropertyDescriptor(b, 'name')!.get)
	generatedRecords.get(a).write(a, 'name', 'Changed')
	expect(a.name).toBe('Changed')
	expect(b.name).toBe('B')
	expect(generatedRecords.get(a).peek(a, 'name')).toBe('Changed')
	expect(() => generatedRecords.get(a).write(a, 'unknown', 1)).toThrow('Unknown')
	expect(createGeneratedRecord({}, [], () => undefined)).toBeUndefined()
})

it('collects visible record shapes including nested abstract selections', () => {
	const selection = {
		fields: { hidden: { visible: false }, node: { visible: true, selection: {
			abstractFields: { fields: { User: { name: { visible: true } } } },
		} } },
	}
	expect(recordShapes([selection, selection])).toEqual([['node'], ['name']])
})
