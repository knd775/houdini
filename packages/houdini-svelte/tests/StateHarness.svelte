<script lang="ts">
	import { untrack } from 'svelte'
	let { source }: any = $props()
	let deep = $state(untrack(() => source.data?.users[0]))
	let raw = $state.raw(untrack(() => source.data?.users[0]))
	const current = $derived(source.data?.users[0])
</script>

<p id="deep">{deep?.name}</p>
<p id="raw">{raw?.name}</p>
<p id="current">{current?.name}</p>
