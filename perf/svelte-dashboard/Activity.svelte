<script>
	import { onMount } from 'svelte'
	import Event from './Event.svelte'
	let { events, stats } = $props()
	const completed = $derived.by(() => { stats.hit('activity.completed'); return events.filter(e => e.task.status === 'done').length })
	onMount(() => stats.mounted())
</script>
<section class="activity"><h2>Activity · {completed} completed</h2><ol>{#each events as event (event.id)}<Event {event} {stats}/>{/each}</ol></section>
