import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { build, preview } from 'vite'
import { generatedRecordPlugin } from './generated-records/plugin.mjs'
import { dashboardSelection, peopleSelection, activitySelection } from './selections.js'
import { collectProbes } from './probes.mjs'
import { profileProjection } from './projection-profile.mjs'
import { projectionVariant } from './projection-variant.mjs'
import { runtimeMode } from '../../packages/houdini-svelte/tests/runtime-mode.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const requireKit = createRequire(new URL('../../e2e/kit/package.json', import.meta.url))
const { svelte } = await import(requireKit.resolve('@sveltejs/vite-plugin-svelte'))
const svelteRoot = path.dirname(requireKit.resolve('svelte/package.json'))
const svelteVersion = JSON.parse(
	await readFile(path.join(svelteRoot, 'package.json'), 'utf8')
).version
const runtime = path.resolve(root, '../../packages/houdini/src/runtime')
const projects = (process.env.PROJECTS ?? '6,18').split(',').map(Number)
const tasksPerProject = Number(process.env.TASKS ?? 24)
const trials = Number(process.env.TRIALS ?? 5)
const updates = Number(process.env.UPDATES ?? 20)
const warmup = Number(process.env.WARMUP ?? 8)
const verifyOnly = process.env.VERIFY_ONLY === '1'
const nativeState = process.env.NATIVE_STATE === '1'
const coldTrials = Number(process.env.COLD_TRIALS ?? 0)
const profiling = Boolean(process.env.PROFILE || process.env.PROJECTION_PROFILE)
const paired = process.env.GENERATED_RECORDS === 'paired'
const variant = process.env.PROJECTION_VARIANT
assert(!(variant && process.env.GENERATED_RECORDS), 'run one paired experiment at a time')
const reactiveModes = ['fields', ...(paired ? ['generated'] : []), ...(variant && !variant.endsWith('-single') ? [variant] : [])]
const generated = process.env.GENERATED_RECORDS === '1' || paired
	? generatedRecordPlugin([dashboardSelection, peopleSelection, activitySelection], paired)
	: undefined
assert(
	[...projects, tasksPerProject, trials, updates].every((v) => Number.isSafeInteger(v) && v > 0)
)
assert(Number.isSafeInteger(warmup) && warmup >= 0)
assert(Number.isSafeInteger(coldTrials) && coldTrials >= 0)
const outDir = await mkdtemp(path.join(os.tmpdir(), 'houdini-dashboard-'))
let server, browser
const summarize = (values) => {
	values = [...values].sort((a, b) => a - b)
	return {
		mean: values.reduce((a, b) => a + b, 0) / values.length,
		median: values[Math.floor(values.length / 2)],
		p95: values[Math.ceil(values.length * 0.95) - 1],
	}
}
try {
	const built = await build({
		root,
		configFile: false,
		logLevel: 'warn',
		resolve: {
			alias: [
				{ find: '$houdini/runtime/config', replacement: `${runtime}/config.ts` },
				{ find: '$houdini/runtime', replacement: runtime },
				{ find: 'HOUDINI_CLIENT_PATH', replacement: `${root}/client.js` },
				{ find: 'houdini/runtime', replacement: runtime },
			],
		},
		plugins: [
			runtimeMode(),
			generated,
			variant ? projectionVariant(variant) : undefined,
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
		build: { outDir, emptyOutDir: true, minify: profiling ? false : undefined },
	})
	const chunks = (Array.isArray(built) ? built : [built]).flatMap(output =>
		output.output.filter(item => item.type === 'chunk'))
	const bundle = {
		javascriptBytes: chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0),
		gzipBytes: chunks.reduce((total, chunk) => total + gzipSync(chunk.code).length, 0),
	}
	server = await preview({
		root,
		configFile: false,
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
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(server.resolvedUrls.local[0])
	await page.waitForFunction(() => window.dashboardBenchmark)
	assert(
		await page.evaluate(() => crossOriginIsolated),
		'high resolution timing requires cross-origin isolation'
	)
	const projectionProfile = process.env.PROJECTION_PROFILE
		? await profileProjection(browser, server.resolvedUrls.local[0], process.env.PROJECTION_PROFILE,
			reactiveModes, Number(process.env.PROFILE_TRIALS ?? 40))
		: undefined
	if (projectionProfile) {
		for (const chunk of chunks) await writeFile(path.join(process.env.PROJECTION_PROFILE, path.basename(chunk.fileName)), chunk.code)
	}
	if (process.env.PROFILE) {
		await mkdir(process.env.PROFILE, { recursive: true })
		const profiler = await page.context().newCDPSession(page)
		await profiler.send('Profiler.enable')
		await profiler.send('Profiler.setSamplingInterval', { interval: 200 })
		for (const mode of ['store', 'fields']) for (const workload of ['mount', 'local-filter']) {
			await page.evaluate(args => window.dashboardBenchmark.profile(...args), [mode, workload, 3])
			await profiler.send('Profiler.start')
			await page.evaluate(args => window.dashboardBenchmark.profile(...args), [mode, workload, 30])
			const { profile } = await profiler.send('Profiler.stop')
			await writeFile(path.join(process.env.PROFILE, `${mode}-${workload}.cpuprofile`), JSON.stringify(profile))
		}
		await profiler.send('Profiler.disable')
	}
	const diagnostics = await page.evaluate(() => window.dashboardBenchmark.verify())
	const mixed = await page.evaluate(() => window.dashboardBenchmark.verifyMixed())
	const native = nativeState
		? await page.evaluate(() => window.dashboardBenchmark.verifyNative())
		: undefined
	console.log(
		`Dashboard correctness checks passed for nine workloads and the mixed sequence in ${1 + reactiveModes.length} modes.`
	)
	console.table(
		diagnostics.map((d) => ({
			mode: d.mode,
			workload: d.workload,
			derived: Object.entries(d.counts)
				.filter(([k]) => !k.startsWith('effect.'))
				.reduce((sum, [, v]) => sum + v, 0),
			effects: Object.entries(d.counts)
				.filter(([k]) => k.startsWith('effect.'))
				.reduce((sum, [, v]) => sum + v, 0),
			rootReads: d.reads.root,
			recordReads: d.reads.record,
			domMutations: d.domMutations,
			mounts: d.mounts,
			unmounts: d.unmounts,
		}))
	)
	const workloads = nativeState
		? ['local-filter']
		: await page.evaluate(() => window.dashboardBenchmark.workloads)
	const modes = ['store', ...reactiveModes, ...(nativeState ? ['native'] : [])]
	const probes = process.env.PROBES === '1'
		? await collectProbes(browser, server.resolvedUrls.local[0], modes)
		: undefined
	// Each measurement gets a fresh page and module instances. Download and
	// module evaluation finish before timing fixture preparation and mounting.
	const coldStart = []
	for (const projectCount of verifyOnly ? [] : projects) {
		const samples = new Map(modes.map(mode => [mode, []]))
		for (let trial = 0; trial < coldTrials; trial++) {
			for (const mode of [...modes.slice(trial % modes.length), ...modes.slice(0, trial % modes.length)]) {
				const coldPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
				coldPage.on('pageerror', error => errors.push(error.message))
				try {
					await coldPage.goto(server.resolvedUrls.local[0])
					await coldPage.waitForFunction(() => window.dashboardBenchmark)
					const result = await coldPage.evaluate(args => window.dashboardBenchmark.timing(...args),
						[mode, 'local-filter', projectCount, tasksPerProject, 1, 0])
					samples.get(mode).push(result.initial)
				} finally { await coldPage.close() }
			}
		}
		if (coldTrials) for (const [mode, initial] of samples) coldStart.push({
			mode, projects: projectCount, tasks: projectCount * tasksPerProject,
			summary: Object.fromEntries(['populateMs', 'prepareMs', 'mountMs', 'totalMs'].map(key =>
				[key, summarize(initial.map(sample => sample[key]))])),
			samples: initial,
		})
	}
	const results = []
	for (const projectCount of verifyOnly ? [] : projects)
		for (const workload of workloads) {
			const byMode = new Map(
				modes.map((mode) => [mode, { samples: [], initial: [] }])
			)
			for (let trial = 0; trial < trials; trial++)
				for (const mode of [
					...modes.slice(trial % modes.length),
					...modes.slice(0, trial % modes.length),
				]) {
					const result = await page.evaluate(
						(args) => window.dashboardBenchmark.timing(...args),
						[mode, workload, projectCount, tasksPerProject, updates, warmup]
					)
					byMode.get(mode).samples.push(...result.samples.map((s) => ({ trial, ...s })))
					byMode.get(mode).initial.push(result.initial)
				}
			for (const [mode, { samples, initial }] of byMode)
				results.push({
					mode,
					workload,
					projects: projectCount,
					tasks: projectCount * tasksPerProject,
					components: initial[0].components,
					elements: initial[0].elements,
					effects: initial[0].effects,
					cacheSubscriptions: initial[0].cacheSubscriptions,
					startup: {
						populateMs: summarize(initial.map((i) => i.populateMs)),
						prepareMs: summarize(initial.map((i) => i.prepareMs)),
						mountMs: summarize(initial.map((i) => i.mountMs)),
						totalMs: summarize(initial.map((i) => i.totalMs)),
						firstUpdateMs: summarize(initial.map((i) => i.firstUpdate.totalMs)),
						samples: initial.map(
							({ populateMs, prepareMs, mountMs, totalMs, firstUpdate }) => ({
								populateMs, prepareMs, mountMs, totalMs, firstUpdate,
							})
						),
					},
					summary: Object.fromEntries(
						['writeMs', 'flushMs', 'totalMs'].map((key) => [
							key,
							summarize(samples.map((s) => s[key])),
						])
					),
					samples,
				})
			console.log(
				`Completed ${projectCount} projects, ${projectCount * tasksPerProject} tasks, ${workload}`
			)
		}
	if (process.env.SCREENSHOT) {
		await page.evaluate(() => window.dashboardBenchmark.preview())
		await page.screenshot({ path: process.env.SCREENSHOT })
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
		config: {
			projectionVariant: variant,
			generatedRecords: generated?.api ? { shapes: generated.api.shapes, sha256: generated.api.sha256, paired } : false,
			projects,
			tasksPerProject,
			trials,
			updates,
			warmup,
			production: true,
			minified: !profiling,
			profiled: profiling,
			fullQueryPipeline: true,
			nativeState,
			coldTrials,
			verifyOnly,
		},
		diagnostics,
		validation: { workloads: diagnostics.length / (1 + reactiveModes.length), modes: 1 + reactiveModes.length, updatesPerWorkload: 4, mixed, native },
		results,
		coldStart,
		probes,
		bundle,
		projectionProfile,
	}
	const output =
		process.env.OUTPUT ??
		path.resolve(
			root,
			verifyOnly
				? '../benchmark.svelte-dashboard-check.json'
				: '../benchmark.svelte-dashboard.json'
		)
	await writeFile(output, JSON.stringify(report, null, 2) + '\n')
	console.table(
		results.map((r) => ({
			tasks: r.tasks,
			mode: r.mode,
			workload: r.workload,
			'median ms': r.summary.totalMs.median.toFixed(3),
			'p95 ms': r.summary.totalMs.p95.toFixed(3),
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
