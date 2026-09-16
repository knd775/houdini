<script>
	import Row from './Row.svelte'
	let { store, stats, work } = $props()
</script>

<Row user={$store} {stats} {work} />
