import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { runtimeMode } from './runtime-mode.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const runtime = path.resolve(root, '../../houdini/src/runtime')
const experiment = process.env.GENERATED_RECORDS === '1'
	? (await import('../../../perf/svelte-dashboard/generated-records/validation.mjs')).validationPlugin()
	: undefined
const server = await createServer({
	configFile: false,
	root,
	plugins: [
		runtimeMode(process.env.EXPERIMENTAL_FIELD_REACTIVITY !== 'false'),
		experiment,
		{
			name: 'ssr-test-page',
			configureServer(server) {
				server.middlewares.use('/ssr', renderPage(server))
			},
		},
		svelte({ configFile: false }),
	],
	resolve: {
		alias: [
			{ find: '$houdini/runtime/config', replacement: `${runtime}/config.ts` },
			{ find: '$houdini/runtime/cache', replacement: `${root}/clientCache.ts` },
			{ find: '$houdini/runtime', replacement: runtime },
			{ find: 'HOUDINI_CLIENT_PATH', replacement: `${root}/client.ts` },
			{ find: 'houdini/runtime', replacement: runtime },
		],
	},
	server: {
		host: '127.0.0.1',
		port: Number(process.env.TEST_PORT ?? 4198),
		strictPort: true,
		fs: { allow: [path.resolve(root, '../../..')] },
	},
})
function renderPage(server) {
	return async (request, response, next) => {
		try {
			const { page } = await server.ssrLoadModule('/ssr.ts')
			const name =
				new URL(request.url, 'http://localhost').searchParams.get('name') ?? 'Server'
			const { body, active } = page(name)
			const data = JSON.stringify({ name, active }).replaceAll('<', '\\u003c')
			response.setHeader('Content-Type', 'text/html')
			response.end(
				await server.transformIndexHtml(
					'/ssr',
					`<!doctype html><html><body><main id="app">${body}</main><script>window.ssr=${data}</script><script type="module" src="/main.ts"></script></body></html>`
				)
			)
		} catch (error) {
			next(error)
		}
	}
}
await server.listen()

for (const signal of ['SIGTERM', 'SIGINT']) {
	process.once(signal, async () => {
		await server.close()
		process.exit(0)
	})
}
