<script>
	import { onMount } from 'svelte'
	import Column from './Column.svelte'
	let { project, filter, stats } = $props()
	const selected = $derived.by(() => { stats.hit('project.search'); return filter ? project.tasks.filter(t => t.title.toLowerCase().includes(filter)) : project.tasks })
	const spent = $derived.by(() => { stats.hit('project.spent'); return project.tasks.reduce((sum, task) => sum + task.spent, 0) })
	const budget = $derived.by(() => { stats.hit('project.budget'); return `${Math.round(spent / project.budget * 100)}% of budget` })
	onMount(() => stats.mounted())
</script>
<section class="project" data-project={project.id}><h2>{project.name} <small>{budget}</small></h2>
	<div class="columns">{#each ['todo', 'doing', 'done'] as status}<Column tasks={selected} {status} {stats}/>{/each}</div>
</section>
