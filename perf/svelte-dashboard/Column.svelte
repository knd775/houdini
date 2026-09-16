<script>
	import { onMount } from 'svelte'
	import TaskCard from './TaskCard.svelte'
	let { tasks, status, stats } = $props()
	const visible = $derived.by(() => { stats.hit('column.filter'); return tasks.filter(task => task.status === status) })
	const hours = $derived.by(() => { stats.hit('column.hours'); return visible.reduce((sum, task) => sum + task.estimate, 0) })
	$effect(() => { stats.effect('column-count', `${status}:${tasks[0]?.id}`, visible.length) })
	onMount(() => stats.mounted())
</script>
<section class="column"><h3>{status} · {visible.length} · {hours}h</h3>
	{#each visible as task (task.id)}<TaskCard {task} {stats}/>{/each}
</section>
