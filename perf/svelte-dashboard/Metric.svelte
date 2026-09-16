<script>
	import { onMount } from 'svelte'
	let { label, value, unit = '', stats } = $props()
	const formatted = $derived.by(() => { stats.hit('metric.format'); return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value) })
	onMount(() => stats.mounted())
</script>
<div class="metric" data-metric={label}><small>{label}</small><strong>{formatted}{unit}</strong></div>
