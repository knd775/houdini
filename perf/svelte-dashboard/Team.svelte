<script>
	import { onMount } from 'svelte'
	import Avatar from './Avatar.svelte'
	let { people, stats } = $props()
	const online = $derived.by(() => { stats.hit('team.online'); return people.filter(p => p.online).length })
	const sorted = $derived.by(() => { stats.hit('team.sort'); return [...people].sort((a,b) => a.name.localeCompare(b.name)) })
	onMount(() => stats.mounted())
</script>
<section class="team"><h2>Team · {online} online</h2>{#each sorted as person (person.id)}<Avatar {person} {stats} location={`team:${person.id}`}/>{/each}</section>
