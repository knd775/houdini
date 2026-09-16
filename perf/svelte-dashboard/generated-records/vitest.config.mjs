import { mergeConfig } from 'vite'
import base from '../../../vite.config.ts'
import { validationPlugin } from './validation.mjs'
import { createRequire } from 'node:module'

const requireKit = createRequire(new URL('../../../e2e/kit/package.json', import.meta.url))
const config = mergeConfig(base, { optimizeDeps: { exclude: ['svelte'] }, plugins: [
	validationPlugin(),
	{
		name: 'experimental-records-svelte-resolution', enforce: 'pre',
		resolveId(source) {
			if (source === 'svelte' || source.startsWith('svelte/')) return requireKit.resolve(source)
		},
	},
] })
delete config.test.projects
config.test.include = [
	'packages/houdini-svelte/runtime/**/*.test.ts',
	'perf/svelte-dashboard/generated-records/records.test.ts',
]
export default config
