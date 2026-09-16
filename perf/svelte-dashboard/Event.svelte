<script>
	import { onMount } from 'svelte'
	import Avatar from './Avatar.svelte'
	let { event, stats } = $props()
	const sentence = $derived.by(() => { stats.hit('event.sentence'); return `${event.actor.name} ${event.action} ${event.task.title}` })
	$effect(() => { stats.effect('event-status', event.id, event.task.status) })
	onMount(() => stats.mounted())
</script>
<li data-event={event.id}><Avatar person={event.actor} {stats} location={`event:${event.id}`}/><p>{sentence}</p><small>{event.task.status}</small></li>
