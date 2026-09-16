import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	testMatch: '*.spec.ts',
	projects: [
		{
			name: 'experimental',
			testMatch: 'reactivity.spec.ts',
			use: { baseURL: 'http://127.0.0.1:4198' },
		},
		{ name: 'legacy', testMatch: 'legacy.spec.ts', use: { baseURL: 'http://127.0.0.1:4199' } },
	],
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4198',
		launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE },
	},
	webServer: [
		{
			command: 'node packages/houdini-svelte/tests/server.mjs',
			cwd: '../../..',
			url: 'http://127.0.0.1:4198',
			reuseExistingServer: false,
		},
		{
			command: 'node packages/houdini-svelte/tests/server.mjs',
			env: { EXPERIMENTAL_FIELD_REACTIVITY: 'false', TEST_PORT: '4199' },
			cwd: '../../..',
			url: 'http://127.0.0.1:4199',
			reuseExistingServer: false,
		},
	],
})
