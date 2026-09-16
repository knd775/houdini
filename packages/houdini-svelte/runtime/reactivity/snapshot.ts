import { copyRecordMetadata } from 'houdini/runtime/cache/identity'

type ObjectValue = Record<string, unknown>
type Container = ObjectValue | unknown[]

export type ResultKey = (value: Readonly<Record<string, unknown>>) => string | undefined

export function isContainer(value: unknown): value is Container {
	if (value === null || typeof value !== 'object') return false
	if (Array.isArray(value)) return true
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

export function isStandardDate(value: unknown): value is Date {
	return value instanceof Date && Object.getPrototypeOf(value) === Date.prototype
}

// GraphQL results are trees. Class instances, functions and symbols are opaque
// scalar values. Arrays can carry Houdini's enumerable __id list metadata.
export function capture(value: unknown, ancestors?: Set<object>): unknown {
	if (isStandardDate(value)) {
		return new Date(value.getTime())
	}
	if (!isContainer(value)) return value
	ancestors ??= new Set<object>()
	if (ancestors.has(value)) throw new Error('Houdini cannot read a cyclic result.')
	ancestors.add(value)
	try {
		const copy: Container = Array.isArray(value) ? new Array(value.length) : {}
		for (const key of Object.keys(value)) {
			const field = capture((value as ObjectValue)[key], ancestors)
			if (key === '__proto__') {
				Object.defineProperty(copy, key, {
					value: field,
					writable: true,
					enumerable: true,
					configurable: true,
				})
			} else {
				;(copy as ObjectValue)[key] = field
			}
		}
		copyRecordMetadata(value, copy)
		return copy
	} finally {
		ancestors.delete(value)
	}
}

export type ReactiveValue<T> = T extends Date | ((...args: any[]) => any)
	? T
	: T extends object
		? // Mapping public keys drops private/protected members of nominal scalar
			// classes. Keep those instances assignable to their original scalar type.
			Pick<T, keyof T> extends T
			? { readonly [K in keyof T]: ReactiveValue<T[K]> }
			: T
		: T
