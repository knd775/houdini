import { expect, test } from '@playwright/test'

test('default stores preserve the legacy API, snapshots and component subscriptions', async ({
	page,
}) => {
	const modules: string[] = []
	page.on('request', (request) => modules.push(request.url()))
	await page.goto('/legacy.html')
	await page.waitForFunction(() => (window as any).legacyTesting)
	await expect(page.locator('#query')).toHaveText('Before')
	await expect(page.locator('#fragment')).toHaveText('Before')
	await expect(page.locator('#variables')).toHaveText('true')
	await page.evaluate(() => {
		;(window as any).legacyTesting.update('One')
		;(window as any).legacyTesting.update('Two')
	})
	await expect(page.locator('#query')).toHaveText('Two')
	await expect(page.locator('#fragment')).toHaveText('Two')
	const state = await page.evaluate(() => (window as any).legacyTesting.inspect())
	expect(state).toMatchObject({
		variables: true,
		directData: false,
		requiresVariables: false,
		fragmentReadable: true,
		metadata: false,
		snapshots: ['Before', 'One', 'Two'],
	})
	expect(state.fieldModes.length).toBeGreaterThan(0)
	expect(state.fieldModes.every((enabled: boolean) => !enabled)).toBe(true)
	expect(modules.filter((url) => url.includes('/runtime/reactivity/'))).toEqual([])
	expect(await page.evaluate(() => (window as any).legacyTesting.destroy())).toBe(0)
})
