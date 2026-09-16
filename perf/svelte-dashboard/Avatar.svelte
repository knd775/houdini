<script>
	import { onMount } from 'svelte'
	let { person, stats, location } = $props()
	const initials = $derived.by(() => { stats.hit('avatar.initials'); return person.name.split(' ').map(s => s[0]).join('') })
	const label = $derived.by(() => { stats.hit('avatar.label'); return `${person.name} · ${person.role}` })
	$effect(() => { stats.effect('presence', location, person.online) })
	onMount(() => stats.mounted())
</script>
<span class="avatar" data-user={person.id} title={label} data-online={person.online}><b>{initials}</b> <span class="person-name">{person.name}</span></span>
