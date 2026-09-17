import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
	await page.goto('/')
	await page.waitForFunction(() => window.testing)
})

test('$state forwards live record fields while $derived also follows replacements', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		const query = await t.query()
		await t.state(query)
		t.clientCache.write({ parent: 'User:t__a', selection: t.row, data: { name: 'Changed' } })
		t.flush()
	})
	for (const id of ['deep', 'raw', 'current']) {
		await expect(page.locator(`#${id}`)).toHaveText('Changed')
	}
	await page.evaluate(() => {
		const t = window.testing
		t.clientCache.write({ selection: t.selection, data: { users: [
			{ tenant: 't', uid: 'replacement', name: 'Replacement', email: 'new@example.com' },
		] } })
		t.flush()
	})
	await expect(page.locator('#current')).toHaveText('Replacement')
	await expect(page.locator('#deep')).toHaveText('Changed')
	await expect(page.locator('#raw')).toHaveText('Changed')
})

test('an absent fragment record warns with its name and cache ID', async ({ page }) => {
	const warnings: string[] = []
	page.on('console', message => {
		if (message.type() === 'warning') warnings.push(message.text())
	})
	await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		await t.fragment(undefined, { ' $fragments': { values: {
			UserFields: { parent: 'User:missing', variables: {} },
		} } })
	})
	expect(warnings).toHaveLength(1)
	expect(warnings[0]).toContain('Fragment "UserFields" could not read cache record "User:missing"')
	expect(warnings[0]).toContain('__typename and key fields')

	warnings.length = 0
	await page.evaluate(async () => {
		const t = window.testing
		await t.fragment(undefined, null)
		await t.fragment(undefined, { ' $fragments': { loading: true, values: {} } })
		t.clientCache.write({ parent: 'User:t__a', selection: t.row, data: { name: null, email: null } })
		await t.fragment()
	})
	expect(warnings).toEqual([])
})

for (const commonField of [false, true]) {
	test(`a fragment diagnoses missing __typename with common fields=${commonField}`, async ({ page }) => {
		const warnings: string[] = []
		page.on('console', (message) => {
			if (message.type() === 'warning') warnings.push(message.text())
		})
		const result = await page.evaluate(async (commonField) => {
			const t = window.testing
			await t.query()
			const typename = { type: 'String', keyRaw: '__typename', visible: false }
			// A concrete parent query can use its schema type to key this response.
			const parentSelection = {
				fields: {
					users: {
						...t.selection.fields.users,
						selection: {
							fields: { ...t.row.fields, __typename: typename },
							fragments: { UserFields: { arguments: {} } },
						},
					},
				},
			}
			const data = {
				users: [
					{ tenant: 't', uid: 'missing-type', name: 'Visible parent', email: 'a@example.com' },
				],
			}
			t.clientCache.write({ selection: parentSelection, data })
			const parent = t.clientCache.read({ selection: parentSelection }).data.users[0]
			const artifact = {
				rootType: 'Node',
				selection: {
					fields: {
						__typename: typename,
						...(commonField ? { email: t.row.fields.email } : {}),
					},
					abstractFields: {
						fields: { User: { ...t.row.fields, __typename: typename } },
						typeMap: {},
					},
				},
			}
			const instance = await t.fragment(undefined, parent, artifact)
			const missing = { name: instance.data?.name ?? null, email: instance.data?.email ?? null }
			// Supplying the omitted field makes a fresh fragment read succeed.
			t.clientCache.write({
				selection: parentSelection,
				data: { users: [{ ...data.users[0], __typename: 'User' }] },
			})
			await t.fragment(undefined, parent, artifact)
			return { parent: parent.name, missing }
		}, commonField)
		expect(result).toEqual({
			parent: 'Visible parent',
			missing: { name: null, email: commonField ? 'a@example.com' : null },
		})
		expect(warnings).toHaveLength(1)
		expect(warnings[0]).toContain('Fragment "UserFields"')
		expect(warnings[0]).toContain('User:t__missing-type')
		expect(warnings[0]).toContain('has no __typename')
		await expect(page.locator('#fragment')).toHaveText('Visible parent')
	})
}

test('a concrete fragment without a typename selection can read a response without it', async ({ page }) => {
	const warnings: string[] = []
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text())
	})
	await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		const selection = {
			fields: {
				users: {
					...t.selection.fields.users,
					selection: {
						...t.row,
						fragments: { UserFields: { arguments: {} } },
					},
				},
			},
		}
		const parent = t.clientCache.read({ selection }).data.users[0]
		await t.fragment(undefined, parent)
	})
	await expect(page.locator('#fragment')).toHaveText('A')
	expect(warnings).toEqual([])
})

test('a generated concrete fragment diagnoses a missing non-null root __typename', async ({ page }) => {
	const warnings: string[] = []
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text())
	})
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		const typename = { type: 'String', keyRaw: '__typename' }
		// Codegen hides the injected typename in the parent, but exposes the
		// fragment's root typename as non-null even for a plain concrete fragment.
		const parentSelection = {
			fields: { ...t.row.fields, __typename: typename },
			fragments: { UserFields: { arguments: {} } },
		}
		const parent = t.clientCache.read({ parent: 'User:t__a', selection: parentSelection }).data
		const artifact = {
			selection: {
				fields: {
					name: t.row.fields.name,
					__typename: { ...typename, visible: true },
				},
			},
		}
		const source = await t.fragment(undefined, parent, artifact)
		const missing = source.data
		// The record and its scalar already exist under the correct cache ID.
		const cachedName = t.clientCache._internal_unstable.storage.get('User:t__a', 'name').value
		t.clientCache.write({
			parent: 'User:t__a',
			selection: parentSelection,
			data: { __typename: 'User' },
		})
		await t.fragment(undefined, parent, artifact)
		return { parentName: parent.name, cachedName, missing }
	})
	expect(result).toEqual({ parentName: 'A', cachedName: 'A', missing: null })
	expect(warnings).toHaveLength(1)
	expect(warnings[0]).toContain('Fragment "UserFields"')
	expect(warnings[0]).toContain('User:t__a')
	expect(warnings[0]).toContain('has no __typename')
	await expect(page.locator('#fragment')).toHaveText('A')
})

test('cache field updates leave unrelated effects and list evaluation alone', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	const counts = await page.evaluate(async () => {
		const t = window.testing
		await t.start()
		t.write('Changed')
		return t.counts
	})
	expect(counts).toEqual({ name: 1, email: 0, derived: 1, list: 0 })
	await expect(page.locator('td').first()).toHaveText('CHANGED')
	expect(errors).toEqual([])
})

test('masked custom IDs retain row objects and DOM nodes across reordering', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start()
		const list = t.result.data.users
		const before = t.result.data.users[0]
		const node = document.querySelector('tr')
		t.cache.write({ selection: t.selection, data: { users: [...t.users].reverse() } })
		t.flush()
		return {
			same: t.result.data.users[1] === before,
			newList: t.result.data.users !== list,
			oldMembership: list[0] === before,
			node: document.querySelectorAll('tr')[1] === node,
			keys: Object.keys(before),
		}
	})
	expect(result).toEqual({
		same: true,
		newList: true,
		oldMembership: true,
		node: true,
		keys: ['name', 'email'],
	})
})

test('optimistic rollback, insertion, deletion and null data reach the DOM', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		await t.start()
		const layer = t.cache._internal_unstable.storage.createLayer(true)
		t.write('Optimistic', layer.id)
		if (document.querySelector('td')!.textContent !== 'OPTIMISTIC')
			throw new Error('optimistic value missing')
		t.cache.clearLayer(layer.id)
		t.flush()
		if (document.querySelector('td')!.textContent !== 'A') throw new Error('rollback failed')
		t.cache.write({
			selection: t.selection,
			data: {
				users: [t.users[1], { tenant: 't', uid: 'c', name: 'C', email: 'c@example.com' }],
			},
		})
		t.flush()
	})
	await expect(page.locator('tr')).toHaveCount(2)
	await expect(page.locator('tr').first()).toHaveText('Bb@example.com')
	await page.evaluate(() => {
		const t = window.testing
		t.cache.write({ selection: t.selection, data: { users: null } })
		t.flush()
	})
	await expect(page.locator('tr')).toHaveCount(0)
})

test('loading, errors and variables update independently of data', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start(false)
		const row = t.result.data.users[0]
		t.source.set({
			...t.source.state,
			fetching: true,
			errors: [{ message: 'Oops' }],
			variables: { page: 2 },
		})
		t.flush()
		return { same: row === t.result.data.users[0], counts: t.counts }
	})
	expect(result).toEqual({ same: true, counts: { name: 0, email: 0, derived: 0, list: 0 } })
	await expect(page.locator('#fetching')).toHaveText('true')
	await expect(page.locator('#errors')).toContainText('Oops')
	await expect(page.locator('#variables')).toHaveText('{"page":2}')
})

test('metadata appearing and disappearing updates its reader without invalidating data', async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start(false)
		const data = t.result.data
		t.source.set({ ...t.source.state, extra: { note: 'Added' } })
		t.flush()
		const added = document.querySelector('#extra')!.textContent
		const { extra, ...withoutExtra } = t.source.state
		t.source.set(withoutExtra)
		t.flush()
		return {
			added,
			removed: document.querySelector('#extra')!.textContent,
			sameData: t.result.data === data,
			counts: t.counts,
		}
	})
	expect(result).toEqual({
		added: '{"note":"Added"}',
		removed: '',
		sameData: true,
		counts: { name: 0, email: 0, derived: 0, list: 0 },
	})
})

test('store replacement and unmount release ownership and reject late values', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start(false)
		const original = t.result
		const old = t.source
		const next = t.replace('Next')
		old.callbacks[0]({ ...old.state, data: null })
		t.flush()
		const name = t.result.data.users[0].name
		await t.destroy()
		next.callbacks[0]({ ...next.state, data: null })
		return {
			name,
			old: [old.active, old.stops],
			next: [next.active, next.stops],
			original: original.data.users[0].name,
			final: t.result.data.users[0].name,
		}
	})
	expect(result).toEqual({
		name: 'Next',
		old: [0, 1],
		next: [0, 1],
		original: 'A',
		final: 'Next',
	})
})

test('same-object store emissions update fields without allowing writes through the result', async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start(false)
		t.source.state.data.users[0].name = 'Edited'
		t.source.set(t.source.state)
		t.flush()
		let rejected = 0
		for (const write of [
			() => (t.result.data.users[0].name = 'Bad'),
			() => t.result.data.users.pop(),
			() => {
				const descriptor = Object.getOwnPropertyDescriptor(t.result.data, 'users')!
				;(descriptor.get ? descriptor.get.call(t.result.data) : descriptor.value).pop()
			},
		]) {
			try {
				write()
			} catch {
				rejected++
			}
		}
		return { counts: t.counts, rejected, name: t.result.data.users[0].name }
	})
	expect(result).toEqual({
		counts: { name: 1, email: 0, derived: 1, list: 0 },
		rejected: 3,
		name: 'Edited',
	})
})

test('server rendering releases subscriptions and hydrates without mismatches', async ({
	page,
	request,
}) => {
	const second = await request.get('/ssr?name=Other')
	expect(await second.text()).toContain('OTHER')
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error') errors.push(message.text())
	})
	await page.goto('/ssr?name=Server')
	await page.waitForFunction(() => window.testing)
	await expect(page.locator('td').first()).toHaveText('SERVER')
	expect(await page.evaluate(() => window.ssr!.active)).toBe(0)
	await page.evaluate(() => {
		const t = window.testing
		t.source.set({
			...t.source.state,
			data: { users: [{ name: 'Client', email: 'a@example.com' }] },
		})
		t.flush()
	})
	await expect(page.locator('td').first()).toHaveText('CLIENT')
	expect(errors).toEqual([])
})

test('the public API consumes real QueryStore observers and cache subscription plugins', async ({
	page,
}) => {
	const counts = await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'Query update' },
		})
		t.flush()
		return t.counts
	})
	expect(counts).toEqual({ name: 1, email: 0, derived: 1, list: 0 })
	await expect(page.locator('td').first()).toHaveText('QUERY UPDATE')
})

test('the public fragment helper exposes field-level updates through its real observer', async ({
	page,
}) => {
	const counts = await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		await t.fragment()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'Fragment update' },
		})
		t.flush()
		return t.counts
	})
	expect(counts.name).toBe(1)
	expect(counts.email).toBe(0)
	await expect(page.locator('#fragment')).toHaveText('Fragment update')
})

test('JSON scalar keys remain own properties across reactive updates', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		await t.start(false)
		const update = (json: string) => {
			t.source.set({ ...t.source.state, extra: JSON.parse(json) })
			t.flush()
		}
		update('{}')
		update('{"__proto__":{"value":1},"constructor":{"name":"data"}}')
		const first = JSON.stringify(t.result.extra)
		update('{"__proto__":null}')
		return {
			first,
			last: JSON.stringify(t.result.extra),
			prototypeUnchanged: Object.getPrototypeOf(t.result.extra) === Object.prototype,
			polluted: 'value' in {},
		}
	})
	expect(result).toEqual({
		first: '{"__proto__":{"value":1},"constructor":{"name":"data"}}',
		last: '{"__proto__":null}',
		prototypeUnchanged: true,
		polluted: false,
	})
})

test('default query fields patch mutation payloads without rebuilding the query', async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		const query = await t.query()
		const cache = t.clientCache._internal_unstable
		const original = cache.getSelection.bind(cache)
		const reads: string[] = []
		cache.getSelection = (args: any) => {
			reads.push(args.parent ?? '_ROOT_')
			return original(args)
		}
		try {
			t.clientCache.write({
				parent: 'User:t__a',
				selection: t.row,
				data: { tenant: 't', uid: 'a', name: 'Patched' },
			})
			t.flush()
			return { reads, name: query.data.users[0].name, counts: t.counts }
		} finally {
			cache.getSelection = original
		}
	})
	expect(result.reads).toEqual(['User:t__a'])
	expect(result.name).toBe('Patched')
	expect(result.counts).toEqual({ name: 1, email: 0, derived: 1, list: 0 })
})

test('ordinary subscriptions retain snapshots while direct fields stay granular', async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		const query = await t.query()
		const snapshots: any[] = []
		const stop = query.subscribe((value: any) => snapshots.push(value))
		for (const name of ['One', 'Two']) {
			t.clientCache.write({
				parent: 'User:t__a',
				selection: { fields: { name: t.row.fields.name } },
				data: { name },
			})
			t.flush()
		}
		stop()
		return {
			names: snapshots.map((value) => value.data.users[0].name),
			current: query.data.users[0].name,
			counts: t.counts,
		}
	})
	expect(result.names).toEqual(['A', 'One', 'Two'])
	expect(result.current).toBe('Two')
	expect(result.counts).toEqual({ name: 2, email: 0, derived: 2, list: 0 })
})

test('non-null propagation and recovery fall back to a complete selection', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: null },
		})
		t.flush()
	})
	await expect(page.locator('tr')).toHaveCount(1)
	await page.evaluate(() => {
		const t = window.testing
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'Recovered' },
		})
		t.flush()
	})
	await expect(page.locator('tr')).toHaveCount(2)
	await expect(page.locator('td').first()).toHaveText('RECOVERED')
})

test('a query resumes after cache changes while its consumers are unmounted', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		const query = await t.query()
		await t.destroy()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'While away' },
		})
		await t.remount(query)
	})
	await expect(page.locator('td').first()).toHaveText('WHILE AWAY')
})

test('a fragment resumes its parent subscription after an inactive period', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		const fragment = await t.fragment()
		await t.destroy()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'While away' },
		})
		await t.remount(fragment, true)
	})
	await expect(page.locator('#fragment')).toHaveText('While away')
	await page.evaluate(() => {
		const t = window.testing
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'Listening' },
		})
		t.flush()
	})
	await expect(page.locator('#fragment')).toHaveText('Listening')
})

test('fetch results retain their snapshot while direct fields continue updating', async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const t = window.testing
		const query = await t.query()
		const fetched = await query.fetch({ policy: 'CacheOnly' })
		t.clientCache.write({
			parent: 'User:t__a',
			selection: { fields: { name: t.row.fields.name } },
			data: { name: 'After fetch' },
		})
		t.flush()
		return { snapshot: fetched.data.users[0].name, live: query.data.users[0].name }
	})
	expect(result).toEqual({ snapshot: 'A', live: 'After fetch' })
})

test('fragment arguments survive mounting, cache updates and remounting', async ({ page }) => {
	await page.evaluate(async () => {
		const t = window.testing
		await t.query()
		await t.fragment(64)
	})
	await expect(page.locator('#fragment')).toHaveText('Argument')
	await page.evaluate(() => {
		const t = window.testing
		t.clientCache.write({
			parent: 'User:t__a',
			selection: t.result.artifact.selection,
			variables: { size: 64 },
			data: { name: 'Updated argument' },
		})
		t.flush()
	})
	await expect(page.locator('#fragment')).toHaveText('Updated argument')
	await page.evaluate(async () => {
		const t = window.testing
		const fragment = t.result
		await t.destroy()
		t.clientCache.write({
			parent: 'User:t__a',
			selection: fragment.artifact.selection,
			variables: { size: 64 },
			data: { name: 'While away' },
		})
		await t.remount(fragment, true)
	})
	await expect(page.locator('#fragment')).toHaveText('While away')
})

test('subscription fetching fields follow listen and unlisten in reactive consumers', async ({
	page,
}) => {
	await page.evaluate(async () => {
		const t = window.testing
		await t.subscription()
	})
	await expect(page.locator('#fetching')).toHaveText('false')
	const listening = await page.evaluate(async () => {
		const t = window.testing
		let snapshot: any
		const stop = t.result.subscribe((value: any) => {
			snapshot = value
		})
		await t.result.listen({})
		t.flush()
		stop()
		return { direct: t.result.fetching, legacy: snapshot.fetching }
	})
	expect(listening).toEqual({ direct: true, legacy: true })
	await expect(page.locator('#fetching')).toHaveText('true')
	await page.evaluate(async () => {
		const t = window.testing
		await t.result.unlisten()
		t.flush()
	})
	await expect(page.locator('#fetching')).toHaveText('false')

	const cleaned = await page.evaluate(async () => {
		const t = window.testing
		const observer = t.result.observer
		const cleanup = observer.cleanup.bind(observer)
		let calls = 0
		observer.cleanup = () => {
			calls++
			return cleanup()
		}
		await t.destroy()
		return calls
	})
	expect(cleaned).toBe(1)
})
