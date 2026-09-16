<script>
	import { onMount } from 'svelte'
	import Avatar from './Avatar.svelte'
	import Progress from './Progress.svelte'
	let { task, stats } = $props()
	const nextStep = $derived.by(() => { stats.hit('inspector.next'); return task.status === 'done' ? 'Ready to archive' : `Follow up with ${task.assignee.name}` })
	$effect(() => { stats.effect('inspector', task.id, task.title) })
	onMount(() => stats.mounted())
</script>
<section class="inspector"><h2>{task.title}</h2><p>{nextStep}</p><Progress spent={task.spent} estimate={task.estimate} {stats}/><Avatar person={task.assignee} {stats} location="inspector"/></section>
