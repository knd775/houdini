<script>
	import { onMount } from 'svelte'
	let { tasks, people, stats } = $props()
	const grouped = $derived.by(() => {
		stats.hit('workload.group')
		const groups = new Map()
		for (const task of tasks) if (task.status !== 'done') groups.set(task.assignee.id, (groups.get(task.assignee.id) ?? 0) + task.estimate)
		return groups
	})
	const ranked = $derived.by(() => {
		stats.hit('workload.rank')
		return people.map(person => ({ id: person.id, name: person.name, hours: grouped.get(person.id) ?? 0 })).sort((a,b) => b.hours - a.hours || a.name.localeCompare(b.name))
	})
	const max = $derived(Math.max(1, ...ranked.map(p => p.hours)))
	$effect(() => { stats.effect('workload', 'top', ranked[0]?.id) })
	onMount(() => stats.mounted())
</script>
<section class="workload"><h2>Open workload</h2>
	{#each ranked as person (person.id)}<div data-workload={person.id}><span>{person.name}</span><meter max={max} value={person.hours}></meter><b>{person.hours}h</b></div>{/each}
</section>
