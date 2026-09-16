// Experimental snapshot reconciliation. Identity is local to each selected list,
// so two query selections never accidentally share a mutable result object.
const plain = (value) =>
	value !== null &&
	typeof value === 'object' &&
	(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

// Snapshots are immutable JSON-shaped results. Compare those before reading
// Svelte proxies, whose property accesses otherwise dominate a large-table diff.
function equal(a, b) {
	if (Object.is(a, b)) return true
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((value, index) => equal(value, b[index]))
	}
	if (!plain(a) || !plain(b)) return false
	const keys = Object.keys(a)
	return (
		keys.length === Object.keys(b).length &&
		keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]))
	)
}

export function reconcile(previous, next, identity, snapshot) {
	if (Object.is(previous, next)) return previous
	if (Array.isArray(previous) && Array.isArray(next)) {
		if (
			Array.isArray(snapshot) &&
			snapshot.length === next.length &&
			snapshot.every((item, index) => identity(item) === identity(next[index]))
		) {
			// Common case: membership and order are unchanged. Unchanged records
			// require no proxy reads, assignments, or signal invalidations.
			for (let index = 0; index < next.length; index++) {
				if (equal(snapshot[index], next[index])) continue
				const value = reconcile(previous[index], next[index], identity, snapshot[index])
				if (previous[index] !== value) previous[index] = value
			}
			return previous
		}
		// Keep duplicate occurrences separate, even when their entity IDs match.
		const keyed = new Map()
		for (const item of previous) {
			const key = identity(item)
			if (key == null) continue
			if (!keyed.has(key)) keyed.set(key, [])
			keyed.get(key).push(item)
		}
		const items = next.map((item, index) => {
			const key = identity(item)
			const candidate = key == null ? previous[index] : keyed.get(key)?.shift()
			return reconcile(candidate, item, identity)
		})
		for (let index = 0; index < items.length; index++) {
			if (previous[index] !== items[index]) previous[index] = items[index]
		}
		if (previous.length !== items.length) previous.length = items.length
		return previous
	}
	if (plain(previous) && plain(next) && identity(previous) === identity(next)) {
		for (const key of Object.keys(snapshot ?? previous)) {
			if (!Object.hasOwn(next, key)) delete previous[key]
		}
		for (const key of Object.keys(next)) {
			if (snapshot && Object.hasOwn(snapshot, key) && equal(snapshot[key], next[key]))
				continue
			const value = reconcile(previous[key], next[key], identity, snapshot?.[key])
			if (!Object.hasOwn(previous, key) || !Object.is(previous[key], value))
				previous[key] = value
		}
		return previous
	}
	// Clone plain values on entry so the result never adopts a cache snapshot's
	// object graph. Custom scalar instances are atomic in this prototype.
	if (Array.isArray(next)) return next.map((item) => reconcile(undefined, item, identity))
	if (plain(next)) {
		return Object.fromEntries(
			Object.entries(next).map(([key, value]) => [key, reconcile(undefined, value, identity)])
		)
	}
	return next
}
