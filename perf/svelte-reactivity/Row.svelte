<script>
	import { onMount } from 'svelte'
	let { user, stats, work } = $props()
	let name = $derived.by(() => {
		if (stats.enabled) stats.derived++
		// Optional deterministic cell-formatting work. The DOM includes the result
		// so the compiler cannot discard this calculation.
		const value = user.name
		let hash = 0
		const iterations = work
		for (let i = 0; i < iterations; i++)
			hash = ((hash * 31) ^ value.charCodeAt(i % value.length)) | 0
		return iterations ? `${value} (${hash})` : value
	})
	$effect(() => {
		if (!stats.enabled) return
		user.name
		stats.names++
	})
	$effect(() => {
		if (!stats.enabled) return
		user.email
		stats.emails++
	})
	onMount(() => {
		if (stats.enabled) stats.mounts++
		return () => {
			if (stats.enabled) stats.unmounts++
		}
	})
</script>

<tr data-id={user.id}><td>{name}</td><td>{user.email}</td></tr>
