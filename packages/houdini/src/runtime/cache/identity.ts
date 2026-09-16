// Cache identity belongs to the selected record, even when its key fields are
// masked or aliased. Keep it out of the result's enumerable/serialized shape.
// Weak keys allow results and request-local caches to be collected normally.
import type { SubscriptionSelection } from '../types.js'

type RecordMetadata = {
	id: string
	// The cache resolves abstract and loading selections before attaching metadata.
	fields?: SubscriptionSelection['fields']
	variables?: {} | null
	hasNullBubble?: boolean
}
const identities = new WeakMap<object, RecordMetadata>()

export function getRecordIdentity(value: object): string | undefined {
	return identities.get(value)?.id
}

export function setRecordMetadata(value: object, metadata: RecordMetadata): void {
	identities.set(value, metadata)
}

export function copyRecordMetadata(source: object, target: object): void {
	const metadata = identities.get(source)
	// Null bubbling belongs to this particular snapshot, not every copy of it.
	if (metadata) identities.set(target, { ...metadata })
}

// A normalized child still exists, but its selection collapsed to null. A
// descendant write may reveal it again, so consumers must reread the selection.
export function markNullBubble(value: object): void {
	const identity = identities.get(value)
	if (identity) identity.hasNullBubble = true
}

export function getRecordMetadata(value: object): RecordMetadata | undefined {
	return identities.get(value)
}
