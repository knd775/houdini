<script lang="ts">
	let { query, row } = $props()
	const data = row.data
</script>

<p id="query">{$query.data?.users[0]?.name}</p>
<p id="fragment">{$data?.name}</p>
<p id="variables">{String(query.variables)}</p>
