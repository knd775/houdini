import { Cache } from '../../packages/houdini/src/runtime/cache/index.ts'
import { setMockConfig } from '../../packages/houdini/src/runtime/config.ts'
import { HoudiniClient } from '../../packages/houdini-core/runtime/client.ts'
import { setMockConfig as setCoreConfig } from '../../packages/houdini-core/runtime/config.ts'

const config = { plugins: { 'houdini-svelte': {} } }
setMockConfig(config)
setCoreConfig(config)
export const cache = new Cache({ ...config, disabled: false })
export default new HoudiniClient({
	cache,
	plugins: [
		() => ({
			network() {
				throw new Error('The dashboard benchmark must not make network requests')
			},
		}),
	],
})
