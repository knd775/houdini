<script>
	import { onMount } from 'svelte'
	import Avatar from './Avatar.svelte'
	import Summary from './Summary.svelte'
	import Workload from './Workload.svelte'
	import Team from './Team.svelte'
	import Activity from './Activity.svelte'
	import Inspector from './Inspector.svelte'
	import Project from './Project.svelte'
	let { data, people, activity, stats, fixture } = $props()
	let filter = $state('')
	const tasks = $derived.by(() => { stats.hit('dashboard.flatten'); return data.workspace.projects.flatMap(p => p.tasks) })
	const selected = $derived(tasks.find(t => t.id === 't0'))
	onMount(() => { fixture.control = { filter(value) { filter = value }, data: () => data }; return stats.mounted() })
</script>
<header><h1>{data.workspace.name}</h1><Avatar person={data.viewer} {stats} location="viewer"/></header>
<Summary {tasks} {stats}/>
<div class="layout">
	<aside><Team people={people.people} {stats}/><Workload {tasks} people={people.people} {stats}/><Inspector task={selected} {stats}/></aside>
	<main><label>Find tasks <input aria-label="Find tasks" bind:value={filter}/></label>{#each data.workspace.projects as project (project.id)}<Project {project} filter={filter.toLowerCase()} {stats}/>{/each}</main>
	<aside><Activity events={activity.activity} {stats}/></aside>
</div>
