// external imports
import { testConfig } from 'houdini-common'
// locals
import { Cache, rootID } from '../cache'

const config = testConfig()

test('write selection to root', function () {
	// instantiate a cache we'll test against
	const cache = new Cache(config)

	// save the data
	const data = {
		viewer: {
			id: '1',
			firstName: 'bob',
		},
	}
	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
			},
		},
	}
	cache.write({
		selection,
		data,
	})

	// make sure we can get back what we wrote
	expect(
		cache.read({
			selection,
		}).data
	).toEqual({
		viewer: {
			id: '1',
			firstName: 'bob',
		},
	})
})

test('linked records with updates', function () {
	// instantiate a cache we'll test against
	const cache = new Cache(config)

	// a deeply nested selection link users to other useres
	const deeplyNestedSelection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				parent: {
					type: 'User',
					keyRaw: 'parent',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// the field selection we will use to verify updates
	const userFields = {
		id: {
			type: 'ID',
			keyRaw: 'id',
		},
		firstName: {
			type: 'String',
			keyRaw: 'firstName',
		},
		parent: {
			type: 'User',
			keyRaw: 'parent',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
			},
		},
	}

	// write the data as a deeply nested object
	cache.write({
		selection: deeplyNestedSelection,
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				parent: {
					id: '2',
					firstName: 'jane',
				},
			},
		},
	})

	// check user 1
	expect(cache.read({ selection: userFields, parent: 'User:1' }).data).toEqual({
		id: '1',
		firstName: 'bob',
		parent: {
			id: '2',
		},
	})

	// check user 2
	expect(cache.read({ selection: userFields, parent: 'User:2' }).data).toEqual({
		id: '2',
		firstName: 'jane',
	})

	// associate user2 with a new parent
	cache.write({
		selection: deeplyNestedSelection,
		data: {
			viewer: {
				id: '2',
				firstName: 'jane-prime',
				parent: {
					id: '3',
					firstName: 'mary',
				},
			},
		},
	})

	// make sure we updated user 2
	expect(cache.read({ selection: userFields, parent: 'User:2' }).data).toEqual({
		id: '2',
		firstName: 'jane-prime',
		parent: {
			id: '3',
		},
	})
	expect(cache.read({ selection: userFields, parent: 'User:3' }).data).toEqual({
		id: '3',
		firstName: 'mary',
	})
})

test('linked lists', function () {
	// instantiate the cache
	const cache = new Cache(config)

	// the selection we will read and write
	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				friends: {
					type: 'User',
					keyRaw: 'friends',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// add some data to the cache
	cache.write({
		selection,
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				friends: [
					{
						id: '2',
						firstName: 'jane',
					},
					{
						id: '3',
						firstName: 'mary',
					},
				],
			},
		},
	})

	// make sure we can get the linked lists back
	expect(cache.read({ selection: selection.viewer.fields, parent: 'User:1' }).data).toEqual({
		id: '1',
		firstName: 'bob',
		friends: [
			{
				id: '2',
				firstName: 'jane',
			},
			{
				id: '3',
				firstName: 'mary',
			},
		],
	})
})

test('list as value with args', function () {
	// instantiate the cache
	const cache = new Cache(config)

	// add some data to the cache
	cache.write({
		selection: {
			viewer: {
				type: 'User',
				keyRaw: 'viewer',
				fields: {
					id: {
						type: 'ID',
						keyRaw: 'id',
					},
					firstName: {
						type: 'String',
						keyRaw: 'firstName',
					},
					favoriteColors: {
						type: 'String',
						keyRaw: 'favoriteColors(where: "foo")',
					},
				},
			},
		},
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				favoriteColors: ['red', 'green', 'blue'],
			},
		},
	})

	// look up the value
	expect(
		cache.read({
			selection: {
				favoriteColors: {
					type: 'String',
					keyRaw: 'favoriteColors(where: "foo")',
				},
			},
			parent: 'User:1',
		}).data
	).toEqual({
		favoriteColors: ['red', 'green', 'blue'],
	})
})

test('writing abstract objects', function () {
	// instantiate a cache we'll test against
	const cache = new Cache(config)

	// save the data
	const data = {
		viewer: {
			__typename: 'User',
			id: '1',
			firstName: 'bob',
		},
	}
	cache.write({
		selection: {
			viewer: {
				type: 'Node',
				abstract: true,
				keyRaw: 'viewer',
				fields: {
					__typename: {
						type: 'String',
						keyRaw: '__typename',
					},
					id: {
						type: 'ID',
						keyRaw: 'id',
					},
					firstName: {
						type: 'String',
						keyRaw: 'firstName',
					},
				},
			},
		},
		data,
	})

	// make sure we can get back what we wrote
	expect(
		cache.read({
			parent: 'User:1',
			selection: {
				__typename: {
					type: 'String',
					keyRaw: '__typename',
				},
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
			},
		}).data
	).toEqual({
		__typename: 'User',
		id: '1',
		firstName: 'bob',
	})
})

test('writing abstract lists', function () {
	// instantiate a cache we'll test against
	const cache = new Cache(config)

	// save the data
	const data = {
		nodes: [
			{
				__typename: 'User',
				id: '1',
				firstName: 'bob',
			},
			{
				__typename: 'User',
				id: '2',
				firstName: 'bob',
			},
		],
	}
	cache.write({
		selection: {
			nodes: {
				type: 'Node',
				abstract: true,
				keyRaw: 'nodes',
				fields: {
					__typename: {
						type: 'String',
						keyRaw: '__typename',
					},
					id: {
						type: 'ID',
						keyRaw: 'id',
					},
					firstName: {
						type: 'String',
						keyRaw: 'firstName',
					},
				},
			},
		},
		data,
	})

	// make sure we can get back what we wrote
	expect(
		cache.read({
			parent: 'User:1',
			selection: {
				__typename: {
					type: 'String',
					keyRaw: '__typename',
				},
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
			},
		}).data
	).toEqual({
		__typename: 'User',
		id: '1',
		firstName: 'bob',
	})
})

test('can pull enum from cached values', function () {
	// instantiate a cache we'll test against
	const cache = new Cache(config)

	// the selection we are gonna write
	const selection = {
		node: {
			type: 'Node',
			keyRaw: 'node',
			fields: {
				enumValue: {
					type: 'MyEnum',
					keyRaw: 'enumValue',
				},
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
			},
		},
	}

	// save the data
	const data = {
		node: {
			id: '1',
			enumValue: 'Hello',
		},
	}

	// write the data to cache
	cache.write({ selection, data })

	// pull the data out of the cache
	expect(cache.read({ selection }).data).toEqual({
		node: {
			id: '1',
			enumValue: 'Hello',
		},
	})
})

test('can store and retrieve lists with null values', function () {
	// instantiate the cache
	const cache = new Cache(config)

	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				friends: {
					type: 'User',
					keyRaw: 'friends',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// add some data to the cache
	cache.write({
		selection,
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				friends: [
					{
						id: '2',
						firstName: 'jane',
					},
					null,
				],
			},
		},
	})

	// make sure we can get the linked lists back
	expect(cache.read({ selection }).data).toEqual({
		viewer: {
			id: '1',
			firstName: 'bob',
			friends: [
				{
					id: '2',
					firstName: 'jane',
				},
				null,
			],
		},
	})
})

test('can store and retrieve lists of lists of records', function () {
	// instantiate the cache
	const cache = new Cache(config)

	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				friends: {
					type: 'User',
					keyRaw: 'friends',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// add some data to the cache
	cache.write({
		selection,
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				friends: [
					[
						{
							id: '2',
							firstName: 'jane',
						},
						null,
					],
					[
						{
							id: '3',
							firstName: 'jane',
						},
						{
							id: '4',
							firstName: 'jane',
						},
					],
				],
			},
		},
	})

	// make sure we can get the linked lists back
	expect(cache.read({ selection }).data).toEqual({
		viewer: {
			id: '1',
			firstName: 'bob',
			friends: [
				[
					{
						id: '2',
						firstName: 'jane',
					},
					null,
				],
				[
					{
						id: '3',
						firstName: 'jane',
					},
					{
						id: '4',
						firstName: 'jane',
					},
				],
			],
		},
	})
})

test('can store and retrieve links with null values', function () {
	// instantiate the cache
	const cache = new Cache(config)

	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			nullable: true,
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				friends: {
					type: 'User',
					keyRaw: 'friends',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// add some data to the cache
	cache.write({
		selection,
		data: {
			viewer: null,
		},
	})

	// make sure we can get the linked record back
	expect(cache.read({ selection }).data).toEqual({
		viewer: null,
	})
})

test('can write list of just null', function () {
	// instantiate the cache
	const cache = new Cache(config)

	const selection = {
		viewer: {
			type: 'User',
			keyRaw: 'viewer',
			fields: {
				id: {
					type: 'ID',
					keyRaw: 'id',
				},
				firstName: {
					type: 'String',
					keyRaw: 'firstName',
				},
				friends: {
					type: 'User',
					keyRaw: 'friends',
					fields: {
						id: {
							type: 'ID',
							keyRaw: 'id',
						},
						firstName: {
							type: 'String',
							keyRaw: 'firstName',
						},
					},
				},
			},
		},
	}

	// add some data to the cache
	cache.write({
		selection,
		data: {
			viewer: {
				id: '1',
				firstName: 'bob',
				friends: [null],
			},
		},
	})

	// make sure we can get the linked lists back
	expect(cache.read({ selection }).data).toEqual({
		viewer: {
			id: '1',
			firstName: 'bob',
			friends: [null],
		},
	})
})

test('null-value cascade from field value', function () {
	// instantiate the cache
	const cache = new Cache(config)

	cache.write({
		selection: {
			viewer: {
				type: 'User',
				keyRaw: 'viewer',
				nullable: false,
				fields: {
					id: {
						keyRaw: 'id',
						type: 'String',
						nullable: false,
					},
				},
			},
		},
		data: {
			viewer: {
				id: '1',
			},
		},
	})

	expect(
		cache.read({
			selection: {
				viewer: {
					type: 'User',
					keyRaw: 'viewer',
					nullable: true,
					fields: {
						id: {
							keyRaw: 'id',
							type: 'String',
							nullable: false,
						},
					},
				},
			},
		}).data
	).toEqual({
		viewer: {
			id: '1',
		},
	})

	expect(
		cache.read({
			selection: {
				viewer: {
					type: 'User',
					keyRaw: 'viewer',
					nullable: false,
					fields: {
						firstName: {
							keyRaw: 'firstName',
							type: 'String',
							nullable: false,
						},
					},
				},
			},
		}).data
	).toEqual({
		viewer: null,
	})
})