/**
 * Copy a readonly list for APIs that reorder or change its membership.
 * Items are shared with the input. Reactive fields stay readonly.
 */
export function mutable<T>(value: readonly T[]): T[] {
	return value.slice()
}
