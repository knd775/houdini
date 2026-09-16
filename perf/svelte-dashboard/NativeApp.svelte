<script>
	import { onMount, untrack } from 'svelte'
	import Dashboard from './Dashboard.svelte'
	let { fixture } = $props()
	const { queries: { dashboard, people, activity }, stats } = untrack(() => fixture)
	// A native Svelte control for mount and local filtering only. It owns the
	// prepared snapshots and has no connection to subsequent cache updates.
	let data = $state(untrack(() => dashboard.observer.state.data))
	let team = $state(untrack(() => people.observer.state.data))
	let events = $state(untrack(() => activity.observer.state.data))
	onMount(() => {
		const stopped = stats.mounted()
		// Own the prepared QueryStore lifetimes, without copying subsequent
		// emissions into the native state control.
		const releases = [dashboard, people, activity].map(query => query.subscribe(() => {}))
		return () => { releases.forEach(release => release()); stopped() }
	})
</script>
<Dashboard {data} people={team} activity={events} {stats} {fixture}/>
