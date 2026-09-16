import { Cache } from 'houdini/runtime/cache'
import { expect, it } from 'vitest'
import { FieldIndex } from './fields.js'
import { project } from './projection.svelte.js'
import { capture } from './snapshot.js'

it('registers duplicate records during projection and patches every selected alias', () => {
	const cache = new Cache({ disabled: false })
	const fields = {
		id: { type: 'ID', keyRaw: 'id', visible: false },
		name: { type: 'String', keyRaw: 'name', visible: true },
		label: { type: 'String', keyRaw: 'name', visible: true },
	}
	const selection = {
		fields: { users: { type: 'User', keyRaw: 'users', visible: true, selection: { fields } } },
	}
	cache.write({
		selection,
		data: { users: [1, 2].map(() => ({ id: '1', name: 'A', label: 'A' })) },
	})
	const snapshot = capture(cache.read({ fieldUpdates: true, selection }).data) as any
	const index = new FieldIndex()
	const current = project(snapshot, index.add)
	cache.write({ parent: 'User:1', selection: { fields }, data: { name: 'B' } })
	expect(
		index.apply({ cache, fields: [{ record: 'User:1', key: 'name' }] }, () => undefined)
	).toBe(true)
	expect(current.users).toEqual([
		{ name: 'B', label: 'B' },
		{ name: 'B', label: 'B' },
	])
	expect(current.users[0]).not.toBe(current.users[1])
	// Patching the owned view must not mutate an incoming snapshot.
	expect(snapshot.users).toEqual([
		{ name: 'A', label: 'A' },
		{ name: 'A', label: 'A' },
	])
})

it('patches aliased fields with variables and unmarshals custom scalars', () => {
	const cache = new Cache({
		disabled: false,
		scalars: {
			Date: {
				type: 'Date',
				unmarshal: (value: any) => new Date(value),
				marshal: (value: Date) => value.toISOString(),
			},
		},
	})
	const fields = {
		id: { type: 'ID', keyRaw: 'id', visible: false },
		label: { type: 'String', keyRaw: 'name(locale: $locale)', visible: true },
		joined: { type: 'Date', keyRaw: 'joined', visible: true },
	}
	const selection = {
		fields: {
			viewer: { type: 'User', keyRaw: 'viewer', visible: true, selection: { fields } },
		},
	}
	const variables = { locale: 'en' }
	cache.write({
		selection,
		variables,
		data: { viewer: { id: '1', label: 'Before', joined: '2026-01-01' } },
	})
	const snapshot = capture(cache.read({ fieldUpdates: true, selection, variables }).data) as any
	const current = project(snapshot) as any
	const index = new FieldIndex(current, snapshot)
	const row = current.viewer
	let patched = false
	cache.subscribe(
		{
			rootType: 'Query',
			selection,
			variables: () => variables,
			fieldUpdates: true,
			onMessage: (message) => {
				if (message.kind === 'update')
					patched = index.apply({ cache, fields: message.fields }, () => undefined)
			},
		},
		variables
	)
	cache.write({
		parent: 'User:1',
		selection: { fields },
		variables,
		data: { label: 'After', joined: '2026-02-01' },
	})
	expect(patched).toBe(true)
	expect(current.viewer).toBe(row)
	expect(row.label).toBe('After')
	expect(row.joined).toEqual(new Date('2026-02-01'))
	expect(snapshot.viewer.joined).not.toBe(row.joined)
	expect(Object.keys(row)).toEqual(['label', 'joined'])
})

it('patches type-specific aliases when the cache masks the abstract discriminator', () => {
	const cache = new Cache({ disabled: false })
	const common = {
		id: { type: 'ID', keyRaw: 'id', visible: false },
		__typename: { type: 'String', keyRaw: '__typename', visible: false },
	}
	const userFields = {
		...common,
		label: { type: 'String', keyRaw: 'name', visible: true },
	}
	const robotFields = {
		...common,
		label: { type: 'String', keyRaw: 'code', visible: true },
	}
	const selection = {
		fields: {
			nodes: {
				type: 'Node',
				keyRaw: 'nodes',
				visible: true,
				abstract: true,
				selection: {
					fields: common,
					abstractFields: {
						typeMap: {},
						fields: { User: userFields, Robot: robotFields },
					},
				},
			},
		},
	}
	cache.write({
		selection,
		data: {
			nodes: [
				{ __typename: 'User', id: '1', label: 'Ada' },
				{ __typename: 'Robot', id: '1', label: 'R1' },
			],
		},
	})
	const snapshot = cache.read({ fieldUpdates: true, selection }).data as any
	expect(snapshot.nodes).toEqual([{ label: 'Ada' }, { label: 'R1' }])
	const index = new FieldIndex()
	const current = project(snapshot, index.add)
	const nodes = current.nodes
	cache.write({ parent: 'User:1', selection: { fields: userFields }, data: { label: 'Grace' } })
	cache.write({ parent: 'Robot:1', selection: { fields: robotFields }, data: { label: 'R2' } })
	expect(
		index.apply(
			{
				cache,
				fields: [
					{ record: 'User:1', key: 'name' },
					{ record: 'Robot:1', key: 'code' },
				],
			},
			() => undefined
		)
	).toBe(true)
	expect(current.nodes).toBe(nodes)
	expect(current.nodes).toEqual([{ label: 'Grace' }, { label: 'R2' }])
	expect(snapshot.nodes).toEqual([{ label: 'Ada' }, { label: 'R1' }])

	// Full-result reconciliation rebuilds the index from fresh cache metadata.
	const rebuilt = new FieldIndex(current, cache.read({ fieldUpdates: true, selection }).data)
	cache.write({ parent: 'Robot:1', selection: { fields: robotFields }, data: { label: 'R3' } })
	expect(
		rebuilt.apply({ cache, fields: [{ record: 'Robot:1', key: 'code' }] }, () => undefined)
	).toBe(true)
	expect(current.nodes).toEqual([{ label: 'Grace' }, { label: 'R3' }])
})

const nullableRow = {
	fields: {
		id: { type: 'ID', keyRaw: 'id', visible: false },
		name: { type: 'String', keyRaw: 'name', visible: true, nullable: true },
	},
}

it.each([
	{ missing: null },
	{ missing: [null] },
	{ missing: [[null]] },
])('keeps scalar updates granular beside an actual null relationship: $missing', ({ missing }) => {
	const cache = new Cache({ disabled: false })
	const selection = {
		fields: {
			viewer: { type: 'User', keyRaw: 'viewer', visible: true, selection: nullableRow },
			missing: {
				type: 'User',
				keyRaw: 'missing',
				visible: true,
				nullable: true,
				selection: nullableRow,
			},
		},
	}
	cache.write({ selection, data: { viewer: { id: '1', name: 'Before' }, missing } })
	const snapshot = capture(cache.read({ fieldUpdates: true, selection }).data) as any
	const current = project(snapshot) as any
	const index = new FieldIndex(current, snapshot)
	cache.write({ parent: 'User:1', selection: nullableRow, data: { name: 'After' } })
	expect(
		index.apply({ cache, fields: [{ record: 'User:1', key: 'name' }] }, () => undefined)
	).toBe(true)
	expect(current.viewer.name).toBe('After')
	expect(current.missing).toEqual(missing)
})

it.each([
	'object',
	'list',
	'nested list',
])('rereads a hidden %s when the same record is visible elsewhere', (kind) => {
	const cache = new Cache({ disabled: false })
	const selection = {
		fields: {
			visible: { type: 'User', keyRaw: 'visible', visible: true, selection: nullableRow },
			hidden: {
				type: 'User',
				keyRaw: 'hidden',
				visible: true,
				nullable: true,
				selection: {
					fields: {
						...nullableRow.fields,
						name: { ...nullableRow.fields.name, nullable: false },
					},
				},
			},
		},
	}
	const row = { id: '1', name: null }
	const wrap = (value: any): any =>
		kind === 'object' ? value : kind === 'list' ? [value] : [[value]]
	cache.write({ selection, data: { visible: row, hidden: wrap(row) } })
	const snapshot = capture(cache.read({ fieldUpdates: true, selection }).data) as any
	expect(snapshot.hidden).toEqual(wrap(null))
	const current = project(snapshot) as any
	const index = new FieldIndex(current, snapshot)
	cache.write({ parent: 'User:1', selection: nullableRow, data: { name: 'Recovered' } })
	expect(
		index.apply({ cache, fields: [{ record: 'User:1', key: 'name' }] }, () => undefined)
	).toBe(false)
	// A rejected patch leaves the complete batch for snapshot reconciliation.
	expect(current.visible.name).toBeNull()
	expect(cache.read({ fieldUpdates: true, selection }).data?.hidden).toEqual(
		wrap({ name: 'Recovered' })
	)
})
