import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Each profile contains only the first direct read of three prepared queries.
// Cache population, query preparation, DOM work and cleanup are outside its scope.
export async function profileProjection(browser, url, directory, modes, trials = 40) {
	if (!Number.isSafeInteger(trials) || trials < 1)
		throw new Error('PROFILE_TRIALS must be a positive integer.')
	await mkdir(directory, { recursive: true })
	const results = []
	for (let trial = 0; trial < trials; trial++) {
		for (const mode of [
			...modes.slice(trial % modes.length),
			...modes.slice(0, trial % modes.length),
		]) {
			const page = await browser.newPage()
			const errors = []
			page.on('pageerror', (error) => errors.push(error.message))
			try {
				await page.goto(url)
				await page.waitForFunction(() => window.dashboardBenchmark)
				await page.evaluate((mode) => window.dashboardBenchmark.prepareProbe(mode), mode)
				const cdp = await page.context().newCDPSession(page)
				await cdp.send('Profiler.enable')
				await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
				await cdp.send('Profiler.start')
				const timing = await page.evaluate(() => window.dashboardBenchmark.projectProbe())
				const { profile } = await cdp.send('Profiler.stop')
				const filename = `${mode}-${String(trial).padStart(2, '0')}.cpuprofile`
				await writeFile(path.join(directory, filename), JSON.stringify(profile))
				results.push({ mode, trial, ...timing, filename, ...summarizeProfile(profile) })
				await page.evaluate(() => window.dashboardBenchmark.disposeProbe())
				if (errors.length) throw new Error(errors.join('\n'))
			} finally {
				await page.close()
			}
		}
	}
	const report = { trials, samplingIntervalUs: 100, results }
	await writeFile(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
	return report
}

function summarizeProfile(profile) {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
	const parents = new Map(
		profile.nodes.flatMap((node) => (node.children ?? []).map((id) => [id, node.id]))
	)
	const self = new Map()
	let projectionUs = 0,
		gcUs = 0,
		outsideUs = 0
	for (let i = 0; i < profile.samples.length; i++) {
		const node = nodes.get(profile.samples[i])
		const delta = profile.timeDeltas[i]
		if (node.callFrame.functionName === '(garbage collector)') {
			gcUs += delta
			continue
		}
		let ancestor = node
		while (ancestor && ancestor.callFrame.functionName !== 'projectProbe')
			ancestor = nodes.get(parents.get(ancestor.id))
		if (!ancestor) {
			outsideUs += delta
			continue
		}
		projectionUs += delta
		const frame = node.callFrame
		const key = `${frame.functionName || '(anonymous)'}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
		self.set(key, (self.get(key) ?? 0) + delta)
	}
	return { projectionUs, gcUs, outsideUs, selfUs: Object.fromEntries(self) }
}
