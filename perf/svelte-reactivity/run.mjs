import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const requireKit = createRequire(new URL('../../e2e/kit/package.json', import.meta.url))
const { svelte } = await import(requireKit.resolve('@sveltejs/vite-plugin-svelte'))
const svelteRoot = path.dirname(requireKit.resolve('svelte/package.json'))
const svelteVersion = JSON.parse(
	await readFile(path.join(svelteRoot, 'package.json'), 'utf8')
).version
const outDir = await mkdtemp(path.join(os.tmpdir(), 'houdini-svelte-reactivity-'))
const modes = ['store', 'reconciled', 'runtime', 'fragments']
const sizes = (process.env.SIZES ?? '100,1000,5000').split(',').map(Number)
const workloads = (process.env.WORK ?? '0,2000').split(',').map(Number)
const trials = Number(process.env.TRIALS ?? 5)
const updates = Number(process.env.UPDATES ?? 40)
const warmup = Number(process.env.WARMUP ?? 10)
assert(sizes.length && sizes.every((n) => Number.isSafeInteger(n) && n > 0))
assert(workloads.length && workloads.every((n) => Number.isSafeInteger(n) && n >= 0))
assert([trials, updates].every((n) => Number.isSafeInteger(n) && n > 0))
assert(Number.isSafeInteger(warmup) && warmup >= 0)
let server
let browser

function summary(samples) {
	const summarize = (key) => {
		const values = samples.map((sample) => sample[key]).sort((a, b) => a - b)
		return {
			mean: values.reduce((sum, value) => sum + value, 0) / values.length,
			median: values[Math.floor(values.length / 2)],
			p95: values[Math.ceil(values.length * 0.95) - 1],
		}
	}
	return Object.fromEntries(
		['cacheMs', 'adapterMs', 'flushMs', 'totalMs'].map((key) => [key, summarize(key)])
	)
}

try {
	// A production build avoids HMR and dev-only Svelte proxy checks. Dependencies
	// come from the existing e2e workspace; no standalone dependency versions.
	await build({
		configFile: false,
		root,
		logLevel: 'warn',
		resolve: {
			alias: [
				{
					find: '$houdini/runtime/config',
					replacement: path.resolve(root, '../../packages/houdini/src/runtime/config.ts'),
				},
				{
					find: 'houdini/runtime',
					replacement: path.resolve(root, '../../packages/houdini/src/runtime'),
				},
			],
		},
		plugins: [
			{
				name: 'benchmark-svelte-resolution',
				enforce: 'pre',
				resolveId(source) {
					if (source === 'svelte') return path.join(svelteRoot, 'src/index-client.js')
					if (source === 'svelte/reactivity')
						return path.join(svelteRoot, 'src/reactivity/index-client.js')
					if (source.startsWith('svelte/')) return requireKit.resolve(source)
				},
			},
			svelte({ configFile: false, compilerOptions: { dev: false } }),
		],
		build: { outDir, emptyOutDir: true },
	})
	server = await preview({
		configFile: false,
		root,
		logLevel: 'warn',
		build: { outDir },
		preview: {
			host: '127.0.0.1',
			port: 0,
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp',
			},
		},
	})
	browser = await chromium.launch({
		headless: true,
		executablePath: process.env.CHROMIUM_EXECUTABLE,
	})
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(server.resolvedUrls.local[0])
	await page.waitForFunction(() => window.reactivityBenchmark)
	assert(
		await page.evaluate(() => crossOriginIsolated),
		'high resolution timing requires cross-origin isolation'
	)
	const diagnostics = await page.evaluate(() => window.reactivityBenchmark.verify())
	console.log('Correctness checks passed. One-field update diagnostics:')
	console.table(diagnostics)
	const results = []
	for (const size of sizes) {
		for (const work of workloads) {
			const byMode = new Map(modes.map((mode) => [mode, []]))
			// Rotate mode order to reduce warm-up/order bias; each trial mounts a
			// fresh cache and table. Samples stay available for further analysis.
			for (let trial = 0; trial < trials; trial++) {
				for (let offset = 0; offset < modes.length; offset++) {
					const mode = modes[(trial + offset) % modes.length]
					const samples = await page.evaluate(
						({ mode, size, work, updates, warmup }) =>
							window.reactivityBenchmark.timing(mode, size, work, updates, warmup),
						{ mode, size, work, updates, warmup }
					)
					byMode.get(mode).push(...samples.map((sample) => ({ trial, ...sample })))
				}
			}
			for (const [mode, samples] of byMode)
				results.push({ size, work, mode, summary: summary(samples), samples })
			console.log(`Completed ${size} rows, formatting work=${work}, ${trials} trials`)
		}
	}
	assert.deepEqual(errors, [], 'browser errors')
	const report = {
		createdAt: new Date().toISOString(),
		environment: {
			node: process.version,
			svelte: svelteVersion,
			chromium: browser.version(),
			platform: `${os.platform()} ${os.arch()}`,
			cpu: os.cpus()[0]?.model,
		},
		config: { sizes, workloads, trials, updates, warmup, production: true },
		diagnostics,
		results,
	}
	const output = process.env.OUTPUT ?? path.join(root, '../benchmark.svelte-reactivity.json')
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
	console.table(
		results.map(({ size, work, mode, summary: s }) => ({
			rows: size,
			work,
			mode,
			'cache mean ms': s.cacheMs.mean.toFixed(3),
			'adapter mean ms': s.adapterMs.mean.toFixed(3),
			'flush mean ms': s.flushMs.mean.toFixed(3),
			'total median ms': s.totalMs.median.toFixed(3),
			'total p95 ms': s.totalMs.p95.toFixed(3),
		}))
	)
	console.log(`Raw results: ${output}`)
} finally {
	await browser?.close()
	if (server)
		await new Promise((resolve, reject) =>
			server.httpServer.close((error) => (error ? reject(error) : resolve()))
		)
	await rm(outDir, { recursive: true, force: true })
}
