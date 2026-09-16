// Allocation sampling and forced GC run on separate pages from timing trials.
// The allocation estimate includes collected objects; retained bytes are the
// JS heap delta after a forced collection. Neither includes renderer/DOM memory.
export async function collectProbes(browser, url, modes, trials = 5) {
	const samples = []
	for (let trial = 0; trial < trials; trial++) {
		for (const mode of [...modes.slice(trial % modes.length), ...modes.slice(0, trial % modes.length)]) {
			for (const phase of ['projection', 'mount']) {
				if (mode === 'native' && phase === 'projection') continue
				const page = await browser.newPage()
				const errors = []
				page.on('pageerror', error => errors.push(error.message))
				try {
					await page.goto(url)
					await page.waitForFunction(() => window.dashboardBenchmark)
					await page.evaluate(mode => window.dashboardBenchmark.prepareProbe(mode), mode)
					const cdp = await page.context().newCDPSession(page)
					await cdp.send('HeapProfiler.enable')
					await cdp.send('HeapProfiler.collectGarbage')
					const before = await cdp.send('Runtime.getHeapUsage')
					await cdp.send('HeapProfiler.startSampling', {
						samplingInterval: 16384,
						includeObjectsCollectedByMajorGC: true,
						includeObjectsCollectedByMinorGC: true,
					})
					const timing = await page.evaluate(phase => phase === 'projection'
						? window.dashboardBenchmark.projectProbe()
						: window.dashboardBenchmark.mountProbe(), phase)
					const { profile } = await cdp.send('HeapProfiler.stopSampling')
					await cdp.send('HeapProfiler.collectGarbage')
					const after = await cdp.send('Runtime.getHeapUsage')
					const details = phase === 'projection'
						? await page.evaluate(() => window.dashboardBenchmark.probeDetails()) : undefined
					if (phase === 'mount') {
						await page.evaluate(() => window.dashboardBenchmark.filterPageProbe(8))
						await cdp.send('HeapProfiler.startSampling', {
							samplingInterval: 16384,
							includeObjectsCollectedByMajorGC: true,
							includeObjectsCollectedByMinorGC: true,
						})
						await page.evaluate(() => window.dashboardBenchmark.filterPageProbe(20))
						const filter = await cdp.send('HeapProfiler.stopSampling')
						const scan = await page.evaluate(() => window.dashboardBenchmark.filterProbe())
						samples.push({ mode, trial, phase: 'filter', sampledBytesPerUpdate: size(filter.profile.head) / 20, ...scan })
					}
					samples.push({ mode, trial, phase, ...timing,
						sampledBytes: size(profile.head), retainedBytes: after.usedSize - before.usedSize, details })
					await page.evaluate(() => window.dashboardBenchmark.disposeProbe())
					if (errors.length) throw new Error(errors.join('\n'))
				} finally { await page.close() }
			}
		}
	}
	return { trials, projects: 18, tasksPerProject: 24, samplingInterval: 16384, samples }
}

function size(node) {
	return node.selfSize + node.children.reduce((sum, child) => sum + size(child), 0)
}
