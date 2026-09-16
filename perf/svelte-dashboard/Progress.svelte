<script>
	import { onMount } from 'svelte'
	let { spent, estimate, stats } = $props()
	const ratio = $derived.by(() => { stats.hit('progress.ratio'); return estimate ? Math.min(100, Math.round(spent / estimate * 100)) : 0 })
	onMount(() => stats.mounted())
</script>
<span class="progress"><meter min="0" max="100" value={ratio}></meter>{spent}/{estimate}h</span>
