<script>
	import { onMount } from 'svelte'
	import Avatar from './Avatar.svelte'
	import Progress from './Progress.svelte'
	let { task, stats } = $props()
	const label = $derived.by(() => { stats.hit('task.label'); return `${task.title} · P${task.priority}` })
	const remaining = $derived.by(() => { stats.hit('task.remaining'); return Math.max(0, task.estimate - task.spent) })
	const urgency = $derived.by(() => { stats.hit('task.urgency'); return task.status === 'done' ? 'Complete' : remaining > 6 ? 'At risk' : 'On track' })
	$effect(() => { stats.effect('task-title', task.id, task.title) })
	$effect(() => { stats.effect('task-status', task.id, task.status) })
	onMount(() => stats.mounted())
</script>
<article class="task" data-task={task.id} data-status={task.status}>
	<h4>{label}</h4><small>{urgency}, {remaining}h remaining</small>
	<Progress spent={task.spent} estimate={task.estimate} {stats}/>
	<Avatar person={task.assignee} {stats} location={`task:${task.id}`}/>
</article>
