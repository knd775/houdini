import { QueryStore } from '../../packages/houdini-svelte/runtime/stores/query.ts'
import { QueryStore as LegacyQueryStore } from 'benchmark:legacy-query'
import { cache } from './client.js'

import { linked, person, task, project, dashboardSelection, peopleSelection, activitySelection } from './selections.js'
export { person, task, project, dashboardSelection, peopleSelection, activitySelection } from './selections.js'

const selections = {
	dashboard: dashboardSelection,
	people: peopleSelection,
	activity: activitySelection,
}

export function makeFixture(projectCount, tasksPerProject, mode = 'fields') {
	cache.reset()
	const people = Array.from({ length: Math.max(12, projectCount * 2) }, (_, i) => ({
		id: `u${i}`,
		name: `Person ${String(i).padStart(2, '0')}`,
		online: i % 3 !== 0,
		role: i % 4 === 0 ? 'Lead' : 'Engineer',
	}))
	const projects = Array.from({ length: projectCount }, (_, p) => ({
		id: `p${p}`,
		name: `Project ${p}`,
		budget: 240 + p * 20,
		tasks: Array.from({ length: tasksPerProject }, (_, t) => ({
			id: `t${p * tasksPerProject + t}`,
			title: `Task ${p * tasksPerProject + t}`,
			status: ['todo', 'doing', 'done'][t % 3],
			estimate: 2 + (t % 8),
			spent: t % 7,
			priority: 1 + (t % 4),
			assignee: people[(p * 7 + t) % people.length],
		})),
	}))
	const tasks = projects.flatMap((p) => p.tasks)
	const events = Array.from({ length: Math.max(18, projectCount * 4) }, (_, i) => ({
		id: `e${i}`,
		action: i % 2 ? 'reviewed' : 'updated',
		actor: people[i % people.length],
		task: tasks[(i * 11) % tasks.length],
	}))
	cache.write({
		selection: dashboardSelection,
		data: { workspace: { id: 'w', name: 'Engineering', projects }, viewer: people[0] },
	})
	cache.write({ selection: peopleSelection, data: { people } })
	cache.write({ selection: activitySelection, data: { activity: events } })
	const queries = Object.fromEntries(
		Object.entries(selections).map(([key, selection]) => [
			key,
			new (mode === 'store' || mode === 'native' ? LegacyQueryStore : QueryStore)({
				storeName: key,
				variables: false,
				artifact: {
					name: key,
					kind: 'HoudiniQuery',
					rootType: 'Query',
					selection,
					raw: '',
					hash: key,
					pluginData: {},
					stripVariables: [],
					policy: 'CacheOnly',
				},
			}),
		])
	)
	const stats = {
		enabled: false,
		counts: {},
		effects: new Map(),
		mounts: 0,
		unmounts: 0,
		hit(key) {
			if (this.enabled) this.counts[key] = (this.counts[key] ?? 0) + 1
		},
		effect(kind, id, value) {
			this.effects.set(`${kind}:${id}`, value)
			this.hit(`effect.${kind}`)
		},
		mounted() {
			this.mounts++
			return () => {
				this.unmounts++
			}
		},
		reset() {
			this.counts = {}
			this.mounts = 0
			this.unmounts = 0
		},
	}
	const statuses = new Map(tasks.map((t) => [t.id, t.status]))
	const writeTask = (id, data, layer) =>
		cache.write({
			parent: `Task:${id}`,
			selection: {
				fields: Object.fromEntries(Object.keys(data).map((k) => [k, task.fields[k]])),
			},
			data,
			layer,
		})
	return {
		cache,
		queries,
		stats,
		projects,
		people,
		tasks,
		control: null,
		writeTask,
		async prepare() {
			await Promise.all(Object.values(queries).map((q) => q.fetch({ policy: 'CacheOnly' })))
		},
		update(kind, i) {
			const index = (i * 17) % tasks.length
			if (kind === 'title') writeTask(tasks[index].id, { title: `Edited task ${i}` })
			else if (kind === 'estimate') writeTask(tasks[index].id, { estimate: 20 + i })
			else if (kind === 'status') {
				const id = tasks[index].id
				const status = statuses.get(id) === 'done' ? 'doing' : 'done'
				statuses.set(id, status)
				writeTask(id, { status })
			} else if (kind === 'shared-user')
				cache.write({
					parent: 'User:u0',
					selection: { fields: { name: person.fields.name } },
					data: { name: `Renamed person ${i}` },
				})
			else if (kind === 'batch') {
				const changed = tasks
					.slice(0, Math.min(40, tasks.length))
					.map((t) => ({ id: t.id, estimate: 30 + i }))
				cache.write({
					selection: {
						fields: {
							changed: linked('Task', 'changed', {
								fields: { id: task.fields.id, estimate: task.fields.estimate },
							}),
						},
					},
					data: { changed },
				})
			} else if (kind === 'reorder')
				cache.write({
					parent: 'Project:p0',
					selection: { fields: { tasks: project.fields.tasks } },
					data: { tasks: i % 2 ? projects[0].tasks : [...projects[0].tasks].reverse() },
				})
			else if (kind === 'insert-remove')
				cache.write({
					parent: 'Project:p0',
					selection: { fields: { tasks: project.fields.tasks } },
					data: {
						tasks:
							i % 2
								? projects[0].tasks
								: [
										...projects[0].tasks,
										{ ...tasks[0], id: 'added', title: 'Added task' },
									],
					},
				})
			else if (kind === 'local-filter') this.control.filter(i % 2 ? '' : 'Task 1')
			else if (kind === 'optimistic-rollback') {
				const layer = cache._internal_unstable.storage.createLayer(true)
				writeTask(tasks[index].id, { estimate: 90 + i }, layer.id)
				return () => {
					cache.clearLayer(layer.id)
					cache._internal_unstable.storage.resolveLayer(layer.id)
				}
			} else throw new Error(`Unknown workload ${kind}`)
		},
	}
}

export const workloads = [
	'title',
	'estimate',
	'status',
	'shared-user',
	'batch',
	'reorder',
	'insert-remove',
	'local-filter',
	'optimistic-rollback',
]
