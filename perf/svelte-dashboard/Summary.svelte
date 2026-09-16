<script>
	import { onMount } from 'svelte'
	import Metric from './Metric.svelte'
	let { tasks, stats } = $props()
	const totals = $derived.by(() => {
		stats.hit('summary.totals')
		return tasks.reduce((v, task) => ({ estimate: v.estimate + task.estimate, spent: v.spent + task.spent, done: v.done + Number(task.status === 'done') }), { estimate: 0, spent: 0, done: 0 })
	})
	const completion = $derived.by(() => { stats.hit('summary.completion'); return tasks.length ? totals.done / tasks.length * 100 : 0 })
	const forecast = $derived.by(() => { stats.hit('summary.forecast'); return totals.estimate - totals.spent })
	$effect(() => { stats.effect('analytics', 'completion', `${totals.done}/${tasks.length}`) })
	onMount(() => stats.mounted())
</script>
<div class="metrics" data-total-estimate={totals.estimate} data-total-done={totals.done}>
	<Metric label="Tasks" value={tasks.length} {stats}/><Metric label="Estimated" value={totals.estimate} unit="h" {stats}/>
	<Metric label="Remaining" value={forecast} unit="h" {stats}/><Metric label="Complete" value={completion} unit="%" {stats}/>
</div>
