<script>
	import { onMount, untrack } from 'svelte'
	import Dashboard from './Dashboard.svelte'
	let { fixture, mode } = $props()
	const { queries: { dashboard, people, activity }, stats } = untrack(() => fixture)
	onMount(() => stats.mounted())
</script>
<Dashboard data={mode !== 'store' ? dashboard.data : $dashboard.data} people={mode !== 'store' ? people.data : $people.data} activity={mode !== 'store' ? activity.data : $activity.data} {stats} {fixture}/>
