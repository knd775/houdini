import { HoudiniClient } from '../../houdini-core/runtime/client.js'
import { setMockConfig } from '../../houdini-core/runtime/config.js'
import cache, { config } from './clientCache.js'

// Exercise the real document observer and cache subscription plugins, supplying
// a deterministic network response so these tests need no GraphQL server.
setMockConfig(config as any)
export default new HoudiniClient({
	cache,
	plugins: [
		() => ({
			network(ctx, { resolve }) {
				resolve(ctx, {
					data: cache.read({
						fieldUpdates: ctx.documentStore.fieldUpdates,
						selection: ctx.artifact.selection,
						parent: ctx.stuff.parentID,
					}).data,
					fetching: false,
					errors: null,
					variables: ctx.variables ?? null,
					partial: false,
					stale: false,
					source: 'cache',
				})
			},
		}),
	],
})
