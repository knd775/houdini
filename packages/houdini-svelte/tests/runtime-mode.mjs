import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const query = fileURLToPath(new URL('../runtime/stores/query.ts', import.meta.url))
const legacyQuery = query.replace('.ts', '.legacy.ts')

// Mirror the generator's module selection when tests build the source runtime.
// A separate query class lets benchmarks compare actual legacy and opted-in stores
// while sharing the same client and cache.
export function runtimeMode(experimental = true) {
	return {
		name: 'svelte-runtime-mode',
		enforce: 'pre',
		resolveId(source) {
			if (source === 'benchmark:legacy-query') return legacyQuery
		},
		async load(id) {
			if (id === legacyQuery)
				return (await readFile(query, 'utf8')).replace("'./mode.js'", "'./legacy.js'")
		},
		transform(source, id) {
			if (experimental && id.endsWith('/stores/mode.ts'))
				return "export * from '../reactivity/stores.js'\n"
		},
	}
}
