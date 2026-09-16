<script>
	import { untrack } from 'svelte'
	import FragmentRow from './FragmentRow.svelte'
	import Row from './Row.svelte'
	let { fixture, work } = $props()
	// Every trial mounts a new table; the fixture never changes during a mount.
	const { store, result, stats, mode, rows } = untrack(() => fixture)
	function list(value) {
		if (stats.enabled) stats.lists++
		return value ?? []
	}
</script>

<table>
	<tbody>
		{#if mode === 'runtime'}
			{#each list(store.data?.users) as user (user.id)}
				<Row {user} {stats} {work} />
			{/each}
		{:else if mode === 'reconciled'}
			{#each list(result.data?.users) as user (user.id)}
				<Row {user} {stats} {work} />
			{/each}
		{:else if mode === 'fragments'}
			{#each list($store.data?.users) as user (user.id)}
				<FragmentRow store={rows.get(user.id)} {stats} {work} />
			{/each}
		{:else}
			{#each list($store.data?.users) as user (user.id)}
				<Row {user} {stats} {work} />
			{/each}
		{/if}
	</tbody>
</table>
