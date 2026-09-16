<script lang="ts">
	import { untrack } from 'svelte'
	let { source, publish, counts }: any = $props()
	untrack(() =>
		publish({
			get result() {
				return source
			},
		}),
	)
	$effect(() => {
		source.data.name
		counts.name++
	})
	$effect(() => {
		source.data.email
		counts.email++
	})
</script>

<p id="fragment">{source.data.name}</p>
