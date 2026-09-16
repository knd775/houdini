import { flushSync, mount, unmount } from 'svelte'
import App from './App.svelte'
import NativeApp from './NativeApp.svelte'
import {
	makeFixture,
	dashboardSelection,
	peopleSelection,
	activitySelection,
	workloads,
} from './fixture.js'
import { cache } from './client.js'
import './style.css'
import { filterProbe } from './filter-probe.svelte.js'

const target = document.querySelector('#app')
const fieldModes = ['fields', ...(window.__pairedGeneratedRecords ? ['generated'] : []), ...(window.__variantMode ? [window.__variantMode] : [])]
const assert = (condition, message) => {
	if (!condition) throw new Error(message)
}
const equal = (a, b, message) =>
	assert(
		JSON.stringify(a) === JSON.stringify(b),
		`${message}: ${JSON.stringify(a).slice(0, 300)}`
	)
const active = new Set()
const subscribe = cache.subscribe.bind(cache)
const unsubscribe = cache.unsubscribe.bind(cache)
cache.subscribe = (spec, ...args) => {
	active.add(spec)
	return subscribe(spec, ...args)
}
cache.unsubscribe = (spec, ...args) => {
	active.delete(spec)
	return unsubscribe(spec, ...args)
}

async function withPage(mode, projectCount, tasksPerProject, diagnostic, fn) {
	assert(active.size === 0, 'previous page left cache subscriptions')
	const started = performance.now()
	const fixture = makeFixture(projectCount, tasksPerProject, mode)
	const populated = performance.now()
	fixture.stats.enabled = diagnostic
	let component
	try {
		const start = performance.now()
		await fixture.prepare()
		const prepared = performance.now()
		component = mount(mode === 'native' ? NativeApp : App, {
			target,
			props: { fixture, mode },
		})
		flushSync()
		await Promise.resolve()
		flushSync()
		const mounted = performance.now()
		assert(active.size === 3, `expected three active query subscriptions, found ${active.size}`)
		assert([...active].every(spec => spec.fieldUpdates === fieldModes.includes(mode)),
			`${mode}: benchmark selected the wrong cache notification mode`)
		if (window.__pairedGeneratedRecords && fieldModes.includes(mode)) {
			assert(window.__isGeneratedRecord(fixture.control.data().workspace) === (mode === 'generated'),
				`${mode}: paired benchmark selected the wrong record implementation`)
		}
		if (window.__variantMode && fieldModes.includes(mode)) {
			assert(window.__isVariantRecord(fixture.control.data().workspace) === (mode === window.__variantMode),
				`${mode}: paired benchmark selected the wrong projector`)
		}
		const initial = {
			populateMs: populated - started,
			prepareMs: prepared - start,
			mountMs: mounted - prepared,
			totalMs: mounted - started,
			components: fixture.stats.mounts,
			elements: target.querySelectorAll('*').length,
			derivations: Object.entries(fixture.stats.counts)
				.filter(([k]) => !k.startsWith('effect.'))
				.reduce((sum, [, v]) => sum + v, 0),
			effects: fixture.stats.effects.size,
			cacheSubscriptions: active.size,
		}
		const result = await fn(fixture, initial)
		assert(cache._internal_unstable.storage.layerCount === 1, 'completed updates left cache layers behind')
		return result
	} finally {
		if (component) await unmount(component)
		await Promise.resolve()
		assert(active.size === 0, `${mode} leaked ${active.size} cache subscriptions after unmount`)
		assert(target.childElementCount === 0, 'unmount did not remove the page')
	}
}

function measure(fixture, workload, iteration, checkpoint) {
	const start = performance.now()
	const undo = fixture.update(workload, iteration)
	const written = performance.now()
	flushSync()
	let writeMs = written - start
	if (undo) {
		checkpoint?.()
		const rollback = performance.now()
		undo()
		writeMs += performance.now() - rollback
		flushSync()
	}
	const end = performance.now()
	return { writeMs, flushMs: end - start - writeMs, totalMs: end - start }
}

function recordReads() {
	const internal = cache._internal_unstable
	const original = internal.getSelection
	const reads = { root: 0, record: 0 }
	internal.getSelection = function (args) {
		reads[args.parent === '_ROOT_' ? 'root' : 'record']++
		return original.call(this, args)
	}
	return {
		reads,
		stop() {
			internal.getSelection = original
		},
	}
}

function domSnapshot() {
	// Include all text, attributes, values and ordering, excluding Svelte's block comments.
	function visit(node) {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim() || null
		if (node.nodeType !== Node.ELEMENT_NODE) return null
		return [
			node.tagName,
			[...node.attributes].map((a) => [a.name, a.value]),
			node instanceof HTMLInputElement ? node.value : null,
			[...node.childNodes].map(visit).filter((v) => v !== null),
		]
	}
	return visit(target)
}

function verifyModel() {
	const data = cache.read({ selection: dashboardSelection }).data
	const people = cache.read({ selection: peopleSelection }).data.people
	const activity = cache.read({ selection: activitySelection }).data.activity
	const tasks = data.workspace.projects.flatMap((p) => p.tasks)
	const metrics = target.querySelector('.metrics')
	equal(
		Number(metrics.dataset.totalEstimate),
		tasks.reduce((n, t) => n + t.estimate, 0),
		'estimated hours'
	)
	equal(
		Number(metrics.dataset.totalDone),
		tasks.filter((t) => t.status === 'done').length,
		'done count'
	)
	const filter = target.querySelector('input').value.toLowerCase()
	const visible = tasks.filter((t) => !filter || t.title.toLowerCase().includes(filter))
	equal(target.querySelectorAll('[data-task]').length, visible.length, 'visible task count')
	for (const task of visible) {
		const card = target.querySelector(`[data-task="${task.id}"]`)
		equal(card.dataset.status, task.status, `card status ${task.id}`)
		equal(
			card.querySelector('h4').textContent,
			`${task.title} · P${task.priority}`,
			`card title ${task.id}`
		)
		equal(
			card.querySelector('.person-name').textContent,
			task.assignee.name,
			`card assignee ${task.id}`
		)
	}
	for (const person of people) {
		const total = tasks
			.filter((t) => t.status !== 'done' && t.assignee.id === person.id)
			.reduce((sum, t) => sum + t.estimate, 0)
		equal(
			target.querySelector(`[data-workload="${person.id}"] b`).textContent,
			`${total}h`,
			`workload ${person.id}`
		)
		for (const avatar of target.querySelectorAll(`[data-user="${person.id}"] .person-name`))
			equal(avatar.textContent, person.name, 'shared user consistency')
	}
	for (const event of activity)
		equal(
			target.querySelector(`[data-event="${event.id}"] p`).textContent,
			`${event.actor.name} ${event.action} ${event.task.title}`,
			'activity consistency'
		)
}

async function diagnostic(mode, workload, projectCount, tasksPerProject) {
	return withPage(mode, projectCount, tasksPerProject, true, (fixture, initial) => {
		verifyModel()
		const snapshots = []
		let first
		for (let i = 0; i < 4; i++) {
			fixture.stats.reset()
			const stableTask = target.querySelector('[data-task="t1"]')
			const monitor = recordReads()
			const observer = new MutationObserver(() => {})
			observer.observe(target, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
			})
			try {
				const beforeEstimate = Number(
					target.querySelector('.metrics').dataset.totalEstimate
				)
				measure(fixture, workload, i, () => {
					const changed = fixture.tasks[(i * 17) % fixture.tasks.length]
					equal(
						Number(target.querySelector('.metrics').dataset.totalEstimate),
						beforeEstimate - changed.estimate + 90 + i,
						'optimistic totals before rollback'
					)
					snapshots.push(domSnapshot())
				})
				const mutations = observer.takeRecords()
				if (!first)
					first = {
						counts: { ...fixture.stats.counts },
						reads: { ...monitor.reads },
						mounts: fixture.stats.mounts,
						unmounts: fixture.stats.unmounts,
						domMutations: mutations.length,
					}
			} finally {
				monitor.stop()
				observer.disconnect()
			}
			verifyModel()
			if (
				[
					'title',
					'estimate',
					'shared-user',
					'batch',
					'reorder',
					'optimistic-rollback',
				].includes(workload)
			)
				assert(
					target.querySelector('[data-task="t1"]') === stableTask,
					`${workload} remounted an unchanged task`
				)
			snapshots.push(domSnapshot())
		}
		if (
			fieldModes.includes(mode) &&
			['title', 'estimate', 'shared-user', 'status', 'batch', 'optimistic-rollback'].includes(
				workload
			)
		) {
			equal(first.reads.root, 0, `${workload} unexpectedly read a complete query`)
			equal(
				first.counts['dashboard.flatten'] ?? 0,
				0,
				`${workload} unexpectedly flattened all projects`
			)
		}
		if (fieldModes.includes(mode) && workload === 'title') {
			equal(first.counts['task.label'], 1, 'only the changed task label should rerun')
			for (const name of [
				'summary.totals',
				'workload.group',
				'team.sort',
				'column.filter',
				'task.remaining',
			])
				equal(first.counts[name] ?? 0, 0, `title change reran unrelated ${name}`)
		}
		return { mode, workload, initial, ...first, snapshots }
	})
}

let probe
window.dashboardBenchmark = {
	workloads,
	async prepareProbe(mode, projectCount = 18, tasksPerProject = 24) {
		assert(!probe, 'dispose the previous probe first')
		const fixture = makeFixture(projectCount, tasksPerProject, mode)
		await fixture.prepare()
		probe = { fixture, mode }
	},
	projectProbe() {
		const start = performance.now()
		probe.views = Object.values(probe.fixture.queries).map(query =>
			fieldModes.includes(probe.mode) ? query.data : query.observer.state.data)
		return { totalMs: performance.now() - start }
	},
	mountProbe() {
		const start = performance.now()
		probe.component = mount(probe.mode === 'native' ? NativeApp : App, {
			target, props: { fixture: probe.fixture, mode: probe.mode },
		})
		flushSync()
		return { totalMs: performance.now() - start }
	},
	filterProbe() {
		return filterProbe(probe.fixture.control.data())
	},
	filterPageProbe(iterations = 20) {
		for (let i = 0; i < iterations; i++) measure(probe.fixture, 'local-filter', i)
	},
	probeDetails() {
		let records = 0, generated = 0, variant = 0
		const visit = value => {
			if (!value || typeof value !== 'object') return
			if (!Array.isArray(value)) {
				records++
				if (window.__isGeneratedRecord?.(value)) generated++
				if (window.__isVariantRecord?.(value)) variant++
			}
			Object.values(value).forEach(visit)
		}
		probe.views?.forEach(visit)
		return { records, generated, variant }
	},
	async disposeProbe() {
		if (probe.component) await unmount(probe.component)
		else {
			// fetch() prepared observers for a future component. A projection-only
			// probe has no component to release that ownership on unmount.
			for (const query of Object.values(probe.fixture.queries)) query.subscribe(() => {})()
		}
		probe = undefined
		await Promise.resolve()
		assert(active.size === 0, 'probe leaked query subscriptions')
	},
	async verifyNative(projectCount = 6, tasksPerProject = 24) {
		const store = await diagnostic('store', 'local-filter', projectCount, tasksPerProject)
		const native = await diagnostic('native', 'local-filter', projectCount, tasksPerProject)
		equal(native.snapshots, store.snapshots, 'native state filter diverged from store rendering')
		delete native.snapshots
		return native
	},
	async profile(mode, workload, iterations = 30) {
		if (workload === 'mount') {
			for (let i = 0; i < iterations; i++) await withPage(mode, 18, 24, false, () => {})
		} else {
			await this.timing(mode, workload, 18, 24, iterations, 5)
		}
	},
	async verifyMixed() {
		const actions = [
			['local-filter', 0],
			['title', 0],
			['shared-user', 0],
			['estimate', 1],
			['status', 2],
			['batch', 1],
			['optimistic-rollback', 2],
			['local-filter', 1],
			['reorder', 0],
			['insert-remove', 0],
			['insert-remove', 1],
		]
		const run = (mode) =>
			withPage(mode, 6, 24, true, (fixture) => {
				const snapshots = []
				for (const [workload, iteration] of actions) {
					measure(fixture, workload, iteration, () => {
						verifyModel()
						snapshots.push(domSnapshot())
					})
					verifyModel()
					snapshots.push(domSnapshot())
				}
				return snapshots
			})
		const store = await run('store')
		for (const mode of fieldModes)
			equal(await run(mode), store, 'mixed sequence diverged between APIs')
		return { actions: actions.length, optimisticCheckpoints: 1, modes: 1 + fieldModes.length }
	},
	async verify(projectCount = 6, tasksPerProject = 24) {
		const diagnostics = []
		for (const workload of workloads) {
			const store = await diagnostic('store', workload, projectCount, tasksPerProject)
			const fields = []
			for (const mode of fieldModes) {
				const result = await diagnostic(mode, workload, projectCount, tasksPerProject)
				equal(result.snapshots, store.snapshots, `${workload}: ${mode} diverged from store rendering`)
				delete result.snapshots
				fields.push(result)
			}
			delete store.snapshots
			diagnostics.push(store, ...fields)
		}
		return diagnostics
	},
	async timing(mode, workload, projectCount, tasksPerProject, updates, warmup) {
		assert(
			mode !== 'native' || workload === 'local-filter',
			'native control has no cache update bridge'
		)
		return withPage(mode, projectCount, tasksPerProject, false, (fixture, initial) => {
			const samples = []
			for (let i = 0; i < updates + warmup; i++) {
				const sample = measure(fixture, workload, i)
				if (i === 0) initial.firstUpdate = sample
				if (i >= warmup) samples.push(sample)
			}
			return { initial, samples }
		})
	},
	async preview(mode = 'fields', projectCount = 6, tasksPerProject = 24) {
		// The preview stays mounted for screenshots or manual inspection.
		const fixture = makeFixture(projectCount, tasksPerProject, mode)
		await fixture.prepare()
		const component = mount(App, { target, props: { fixture, mode } })
		flushSync()
		return { dispose: () => unmount(component) }
	},
}
