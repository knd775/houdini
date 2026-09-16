import { flushSync } from 'svelte'

// Isolate dependency tracking and title scanning from DOM/component lifecycles.
// This synthetic probe does not replace the dashboard's local-filter workload.
export function filterProbe(data, iterations = 200) {
	let needle = $state('task 1')
	let selected
	const dispose = $effect.root(() => {
		$effect(() => {
			selected = data.workspace.projects.map(project =>
				project.tasks.filter(task => task.title.toLowerCase().includes(needle)))
		})
	})
	try {
		flushSync()
		const start = performance.now()
		for (let i = 0; i < iterations; i++) {
			needle = i % 2 ? 'task 1' : 'task 2'
			flushSync()
		}
		return {
			perScanMs: (performance.now() - start) / iterations,
			matches: selected.reduce((total, tasks) => total + tasks.length, 0),
		}
	} finally { dispose(); flushSync() }
}
