import { expect, test, vi } from 'vitest'

import { testConfigFile } from '../../../test/index.js'
import type { SubscriptionSelection } from '../../types.js'
import { Cache } from '../index.js'

const config = testConfigFile()

const field = (name: string, type = 'String', nullable = false) => ({
	type,
	keyRaw: name,
	visible: true,
	nullable,
})

// errors {
//   ... on ValidationError { message field }
//   ... on ObjectNotFoundError { message }
//   ... on Error { message }
// }
// against `union MutationError = ValidationError | ObjectNotFoundError`, so codegen
// maps nothing to Error and only a type added to the union later can hit that fragment
const errorsSelection: SubscriptionSelection = {
	fields: {
		__typename: field('__typename'),
	},
	abstractFields: {
		fields: {
			ValidationError: {
				__typename: field('__typename'),
				message: field('message'),
				field: field('field'),
			},
			ObjectNotFoundError: {
				__typename: field('__typename'),
				message: field('message'),
			},
			Error: {
				__typename: field('__typename'),
				message: field('message'),
			},
		},
		typeMap: {},
		fallbackTypes: ['Error'],
	},
}

const selection: SubscriptionSelection = {
	fields: {
		editEntry: {
			type: 'EditEntryPayload',
			keyRaw: 'editEntry',
			visible: true,
			selection: {
				fields: {
					errors: {
						type: 'MutationError',
						keyRaw: 'errors',
						visible: true,
						abstract: true,
						selection: errorsSelection,
					},
				},
			},
		},
	},
}

test('unknown member reads back the fields of the interface fragment', () => {
	const cache = new Cache(config)

	cache.write({
		selection,
		data: {
			editEntry: {
				errors: [
					{ __typename: 'ValidationError', message: 'known', field: 'title' },
					{ __typename: 'BrandNewError', message: 'new type' },
				],
			},
		},
	})

	expect(cache.read({ selection }).data).toEqual({
		editEntry: {
			errors: [
				{ __typename: 'ValidationError', message: 'known', field: 'title' },
				{ __typename: 'BrandNewError', message: 'new type' },
			],
		},
	})
})

test('known member does not pick up fallback fields', () => {
	const cache = new Cache(config)

	cache.write({
		selection,
		data: {
			editEntry: {
				errors: [{ __typename: 'ObjectNotFoundError', message: 'gone', field: 'title' }],
			},
		},
	})

	expect(cache.read({ selection }).data).toEqual({
		editEntry: {
			errors: [{ __typename: 'ObjectNotFoundError', message: 'gone' }],
		},
	})
})

test('unknown member that matches no fragment does not null the list', () => {
	const cache = new Cache(config)

	// the server sends no `message` because BrandNewThing doesn't implement Error
	cache.write({
		selection,
		data: {
			editEntry: {
				errors: [{ __typename: 'BrandNewThing' }],
			},
		},
	})

	expect(cache.read({ selection })).toMatchObject({
		data: { editEntry: { errors: [{ __typename: 'BrandNewThing' }] } },
		partial: false,
	})
})

test('unknown member gets the fields of every abstract fragment it matched', () => {
	const cache = new Cache(config)

	const nodeSelection: SubscriptionSelection = {
		fields: {
			item: {
				type: 'SearchResult',
				keyRaw: 'item',
				visible: true,
				abstract: true,
				selection: {
					fields: { __typename: field('__typename') },
					abstractFields: {
						fields: {
							Titled: {
								__typename: field('__typename'),
								title: field('title'),
							},
							Dated: {
								__typename: field('__typename'),
								publishedAt: field('publishedAt'),
							},
						},
						typeMap: { Article: 'Titled', Event: 'Dated' },
						fallbackTypes: ['Dated', 'Titled'],
					},
				},
			},
		},
	}

	// Podcast implements Titled but not Dated
	cache.write({
		selection: nodeSelection,
		data: { item: { __typename: 'Podcast', title: 'Episode 1' } },
	})

	expect(cache.read({ selection: nodeSelection })).toMatchObject({
		data: { item: { __typename: 'Podcast', title: 'Episode 1' } },
		partial: false,
	})
})

test('subscribers see updates to fallback fields of an unknown member', () => {
	const cache = new Cache(config)

	const viewerSelection: SubscriptionSelection = {
		fields: {
			node: {
				type: 'Node',
				keyRaw: 'node',
				visible: true,
				abstract: true,
				selection: {
					fields: {
						__typename: field('__typename'),
						id: field('id', 'ID'),
					},
					abstractFields: {
						fields: {
							Named: {
								__typename: field('__typename'),
								id: field('id', 'ID'),
								name: field('name'),
							},
						},
						typeMap: { User: 'Named' },
						fallbackTypes: ['Named'],
					},
				},
			},
		},
	}

	cache.write({
		selection: viewerSelection,
		data: { node: { __typename: 'Robot', id: '1', name: 'R2' } },
	})

	const set = vi.fn()
	cache.subscribe({ rootType: 'Query', selection: viewerSelection, onMessage: set })

	// a different document updates the same record
	cache.write({
		selection: {
			fields: {
				robot: {
					type: 'Robot',
					keyRaw: 'robot',
					visible: true,
					selection: {
						fields: {
							__typename: field('__typename'),
							id: field('id', 'ID'),
							name: field('name'),
						},
					},
				},
			},
		},
		data: { robot: { __typename: 'Robot', id: '1', name: 'R2-D2' } },
	})

	expect(set).toHaveBeenCalledWith({
		kind: 'update',
		data: { node: { __typename: 'Robot', id: '1', name: 'R2-D2' } },
	})
})
