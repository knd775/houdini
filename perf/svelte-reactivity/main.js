import { flushSync, mount, unmount } from 'svelte'
import { makeFixture, tableSelection } from './fixture.js'
import { ReactiveResult } from './result.svelte.js'
import Table from './Table.svelte'

const target = document.querySelector('#app')
function assert(condition, message) {
	if (!condition) throw new Error(message)
}
const assertEqual = (actual, expected, message) =>
	assert(
		JSON.stringify(actual) === JSON.stringify(expected),
		`${message}: ${JSON.stringify(actual)}`
	)

async function withTable(mode, size, work, fn, diagnostic = false) {
	const fixture = makeFixture(mode, size)
	fixture.stats.enabled = diagnostic
	let component
	try {
		component = mount(Table, { target, props: { fixture, work } })
		flushSync()
		return await fn(fixture)
	} finally {
		if (component) await unmount(component)
		fixture.dispose()
		const notifications = fixture.metrics.notifications
		fixture.write(0, 'After disposal')
		assertEqual(
			fixture.metrics.notifications,
			notifications,
			'unsubscribe prevents further notifications'
		)
	}
}

function observeDOM() {
	const observer = new MutationObserver(() => {})
	observer.observe(target, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	})
	return observer
}
function reset(stats) {
	for (const key of Object.keys(stats)) if (key !== 'enabled') stats[key] = 0
}

async function diagnostic(mode, size) {
	return withTable(
		mode,
		size,
		0,
		(fixture) => {
			const { stats, metrics } = fixture
			reset(stats)
			const observer = observeDOM()
			try {
				const index = Math.floor(size / 2)
				const row = target.querySelector(`[data-id="${index}"]`)
				fixture.write(index, 'Changed')
				flushSync()
				const records = observer.takeRecords()
				const counts = { ...stats }
				delete counts.enabled
				assertEqual(
					row.firstElementChild.textContent,
					'Changed',
					`${mode} renders changed name`
				)
				assert(
					row === target.querySelector(`[data-id="${index}"]`),
					`${mode} preserves DOM row`
				)
				assertEqual(
					target.querySelectorAll('tr').length,
					size,
					`${mode} preserves table size`
				)
				assertEqual(metrics.notifications, 1, `${mode} notifies one subscription`)
				assertEqual(counts.mounts + counts.unmounts, 0, `${mode} does not remount rows`)
				assertEqual(records.length, 1, `${mode} changes just one DOM text node`)
				if (mode === 'reconciled' || mode === 'runtime') {
					assertEqual(
						[counts.lists, counts.derived, counts.names, counts.emails],
						[0, 1, 1, 0],
						'field granularity'
					)
				}
				if (mode === 'fragments') {
					assertEqual(
						[counts.lists, counts.derived, counts.names, counts.emails],
						[0, 1, 1, 1],
						'row granularity'
					)
				}
				reset(stats)
				fixture.write(index, 'Changed')
				flushSync()
				assertEqual(
					stats.derived + stats.names + stats.emails + stats.lists,
					0,
					`${mode} no-op cache write`
				)
				assertEqual(observer.takeRecords().length, 0, `${mode} no-op DOM`)
				if (fixture.result) {
					fixture.result.apply(fixture.cache.read({ selection: tableSelection }).data)
					flushSync()
					assertEqual(
						stats.derived + stats.names + stats.emails + stats.lists,
						0,
						'equivalent snapshot does not invalidate'
					)
					assertEqual(
						observer.takeRecords().length,
						0,
						'equivalent snapshot leaves DOM unchanged'
					)
				}
				const layer = fixture.cache._internal_unstable.storage.createLayer(true)
				fixture.write(index, 'Optimistic', layer.id)
				flushSync()
				assertEqual(
					row.firstElementChild.textContent,
					'Optimistic',
					`${mode} optimistic value`
				)
				fixture.cache.clearLayer(layer.id)
				flushSync()
				assertEqual(row.firstElementChild.textContent, 'Changed', `${mode} rollback`)
				return { mode, size, ...counts, domMutations: records.length }
			} finally {
				observer.disconnect()
			}
		},
		true
	)
}

function reconcileChecks() {
	// These run against Svelte proxies, not just ordinary JS objects.
	const identity = (value) => value?.id
	const optional = new ReactiveResult({}, identity)
	optional.apply({ optional: undefined })
	assert(Object.hasOwn(optional.data, 'optional'), 'explicit undefined field is present')
	optional.apply({})
	assert(!Object.hasOwn(optional.data, 'optional'), 'absent field is removed')
	const input = {
		users: [
			{ id: 'a', name: 'A', detail: { label: 'old' } },
			{ id: 'b', name: 'B' },
		],
	}
	const state = new ReactiveResult(input, identity)
	const root = state.data
	const list = root.users
	const [a, b] = list
	const detail = a.detail
	state.apply({
		users: [
			{ id: 'b', name: 'Bee' },
			{ id: 'a', name: 'A', detail: { label: 'new' } },
		],
	})
	assert(state.data === root && root.users === list, 'root and list identities survive reorder')
	assert(
		list[0] === b && list[1] === a && a.detail === detail,
		'record and nested identities survive reorder'
	)
	assertEqual(
		[b.name, detail.label, input.users[0].detail.label],
		['Bee', 'new', 'old'],
		'nested change without snapshot mutation'
	)
	state.apply({
		users: [
			{ id: 'a', name: 'A' },
			{ id: 'c', name: 'C' },
		],
	})
	assert(
		list[0] === a && list[1].id === 'c' && !('detail' in a),
		'insert, delete and removed field'
	)
	state.apply({ users: null })
	assert(state.data.users === null, 'nullable list')
	state.apply(null)
	assert(state.data === null, 'nullable root')
	state.apply({ users: [{ id: 'a', name: 'A' }] })
	assertEqual(state.data.users[0].name, 'A', 'recover from null root')
	const independent = new ReactiveResult(
		{ users: [{ id: 'a', name: 'Other selection' }] },
		identity
	)
	state.apply({ users: [{ id: 'a', name: 'Changed' }] })
	assertEqual(independent.data.users[0].name, 'Other selection', 'result ownership')
	const custom = new ReactiveResult(
		{
			users: [
				{ key: 'a', name: 'A' },
				{ key: 'b', name: 'B' },
			],
		},
		(v) => v?.key
	)
	const first = custom.data.users[0]
	custom.apply({
		users: [
			{ key: 'b', name: 'B' },
			{ key: 'a', name: 'A' },
		],
	})
	assert(custom.data.users[1] === first, 'custom identity callback')
	const duplicate = new ReactiveResult(
		{
			users: [
				{ id: 'a', name: 'A' },
				{ id: 'a', name: 'A' },
			],
		},
		identity
	)
	const [one, two] = duplicate.data.users
	duplicate.apply({
		users: [
			{ id: 'a', name: 'B' },
			{ id: 'a', name: 'B' },
		],
	})
	assert(
		duplicate.data.users[0] === one && duplicate.data.users[1] === two && one !== two,
		'duplicate occurrences remain separate'
	)
}

async function listChecks() {
	await withTable('reconciled', 3, 0, (fixture) => {
		const { result, cache } = fixture
		const original = result.data.users[0]
		const node = target.querySelector('[data-id="0"]')
		const users = cache.read({ selection: tableSelection }).data.users
		cache.write({ selection: tableSelection, data: { users: [users[2], users[0], users[1]] } })
		flushSync()
		assertEqual(
			[...target.querySelectorAll('tr')].map((row) => row.dataset.id),
			['2', '0', '1'],
			'cache reorder reaches DOM'
		)
		assert(
			result.data.users[1] === original && target.querySelector('[data-id="0"]') === node,
			'cache reorder keeps proxy and node'
		)
		cache.write({
			selection: tableSelection,
			data: {
				users: [
					users[0],
					{ __typename: 'User', id: '3', name: 'New', email: 'new@example.com' },
				],
			},
		})
		flushSync()
		assertEqual(
			[...target.querySelectorAll('tr')].map((row) => row.dataset.id),
			['0', '3'],
			'cache insertion and deletion'
		)
		cache.write({ selection: tableSelection, data: { users: null } })
		flushSync()
		assertEqual(target.querySelectorAll('tr').length, 0, 'cache null clears table')
	})
}

async function timing(mode, size, work, updates, warmup) {
	return withTable(mode, size, work, (fixture) => {
		const samples = []
		for (let iteration = 0; iteration < updates + warmup; iteration++) {
			fixture.metrics.adapterMs = 0
			const start = performance.now()
			fixture.write((iteration * 7919) % size, `Changed ${iteration}`)
			const written = performance.now()
			flushSync()
			const flushed = performance.now()
			if (iteration >= warmup) {
				const adapter = fixture.metrics.adapterMs
				samples.push({
					cacheMs: written - start - adapter,
					adapterMs: adapter,
					flushMs: flushed - written,
					totalMs: flushed - start,
				})
			}
		}
		return samples
	})
}

window.reactivityBenchmark = {
	async verify() {
		reconcileChecks()
		await listChecks()
		const diagnostics = []
		for (const mode of ['store', 'reconciled', 'runtime', 'fragments'])
			diagnostics.push(await diagnostic(mode, 1000))
		return diagnostics
	},
	timing,
}
