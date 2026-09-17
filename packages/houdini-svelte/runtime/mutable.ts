/**
 * Copy a readonly list for APIs that reorder or change its membership.
 * Items are shared with the input. Reactive fields stay readonly.
 */
export function mutable<T extends readonly unknown[]>(value: T): T[number][] {
	return value.slice()
}
