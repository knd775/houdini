import { render } from 'svelte/server'
import Harness from './Harness.svelte'
import { Source, initial } from './fixtures.js'

export function page(name: string) {
	const source = new Source(initial(name))
	const { body } = render(Harness, { props: { source } })
	return { body, active: source.active }
}
