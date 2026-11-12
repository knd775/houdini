import type { SubscriptionSelection } from './types.js'

const _memoCache = new WeakMap<
	SubscriptionSelection,
	Map<string, Required<SubscriptionSelection>['fields']>
>()

export function getFieldsForType(
	selection: SubscriptionSelection,
	__typename: string | undefined | null,
	loading: boolean
): Required<SubscriptionSelection>['fields'] {
	const cacheKey = `${__typename ?? ''}:${loading ? 1 : 0}`
	let inner = _memoCache.get(selection)
	if (inner !== undefined) {
		const cached = inner.get(cacheKey)
		if (cached !== undefined) return cached
	} else {
		inner = new Map()
		_memoCache.set(selection, inner)
	}
	const result = _getFieldsForType(selection, __typename, loading)
	inner.set(cacheKey, result)
	return result
}

function _getFieldsForType(
	selection: SubscriptionSelection,
	__typename: string | undefined | null,
	loading: boolean
): Required<SubscriptionSelection>['fields'] {
	// if we are loading, then we either have loading types or we return the base fields
	if (loading) {
		if (selection.loadingTypes && selection.loadingTypes.length > 0) {
			return deepMerge(
				...selection.loadingTypes.map((type) => selection.abstractFields?.fields[type])
			)
		}

		return selection.fields ?? {}
	}

	// we need to figure out the correct selection by looking at the actual type
	// and evaluating which selection is the right fit

	let targetSelection = selection.fields || {}
	const abstractFields = selection.abstractFields
	// if we have abstract fields, grab the __typename and include them in the list
	if (abstractFields && __typename) {
		// if the type needs to be mapped to an abstract one, use that selection instead
		const mappedType = abstractFields.typeMap[__typename]
		if (mappedType) {
			targetSelection = abstractFields.fields[mappedType]!
		} else if (abstractFields.fields[__typename]) {
			targetSelection = abstractFields.fields[__typename]!
		} else if (abstractFields.fallbackTypes?.length) {
			// a known member that matches no abstract fragment also lands here. the server
			// sends none of the fallback-only fields for it, so getSelection skips them and
			// the result matches the base fields
			targetSelection = deepMerge(
				selection.fields,
				...abstractFields.fallbackTypes.map((type) => abstractFields.fields[type])
			)
			_fallbackOnlyFields.set(
				targetSelection,
				new Set(Object.keys(targetSelection).filter((key) => !selection.fields?.[key]))
			)
		}
	}

	return targetSelection
}

const _fallbackOnlyFields = new WeakMap<Required<SubscriptionSelection>['fields'], Set<string>>()

// the fields a result of getFieldsForType took from fallback fragments the type may not
// match, so a missing value means the field doesn't apply rather than a cache miss
export function fallbackOnlyFields(
	fields: Required<SubscriptionSelection>['fields']
): Set<string> | undefined {
	return _fallbackOnlyFields.get(fields)
}

// This function performs a very simple deep merge that shouldn't be used in an open ended response.
// It's not resilient to things like circular references so it should only be used on artifact selections.
function deepMerge(...objects: (Record<string, any> | undefined)[]) {
	const mergedObj: Record<string, any> = {}
	for (const obj of objects) {
		if (!obj) {
			continue
		}
		for (const prop in obj) {
			if (prop in obj) {
				const val = obj[prop]

				if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
					mergedObj[prop] = deepMerge((mergedObj[prop] as Record<string, any>) || {}, val)
				} else {
					mergedObj[prop] = val
				}
			}
		}
	}

	return mergedObj
}
