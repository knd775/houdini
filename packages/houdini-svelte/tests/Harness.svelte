<script lang="ts">
	import { untrack } from 'svelte'
	import Consumer from './Consumer.svelte'
	let {
		source,
		fetchingOnly = false,
		publish = () => {},
		counts = { name: 0, email: 0, derived: 0, list: 0 },
	}: any = $props()
	let currentSource = $state.raw(untrack(() => source))
	untrack(() =>
		publish({
			get result() {
				return currentSource
			},
			replace: (next: any) => {
				currentSource = next
			},
		}),
	)
	function list(users: any[]) {
		counts.list++
		return (users ?? []).filter(Boolean)
	}
</script>

<p id="fetching">{String(currentSource.fetching)}</p>
{#if !fetchingOnly}
<p id="errors">{JSON.stringify(currentSource.errors)}</p>
<p id="variables">{JSON.stringify(currentSource.variables)}</p>
<p id="extra">{JSON.stringify(currentSource.extra)}</p>
<table>
	<tbody>
		{#each list(currentSource.data?.users) as user (user.email)}
			<Consumer {user} {counts} />
		{/each}
	</tbody>
</table>
{/if}
