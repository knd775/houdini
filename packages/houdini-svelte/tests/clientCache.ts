import { Cache } from 'houdini/runtime/cache'
import { setMockConfig } from 'houdini/runtime/config'

export const config = {
	plugins: { 'houdini-svelte': {} },
	types: { User: { keys: ['tenant', 'uid'] } },
}
setMockConfig(config as any)
export default new Cache({ ...config, disabled: false } as any)
