<script lang="ts">
	let { user, counts }: { user: any; counts: Record<string, number> } = $props()
	let label = $derived.by(() => {
		counts.derived++
		return user.name.toUpperCase()
	})
	$effect(() => {
		user.name
		counts.name++
	})
	$effect(() => {
		user.email
		counts.email++
	})
</script>

<tr><td>{label}</td><td>{user.email}</td></tr>
