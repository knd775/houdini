import { expect, test, type Request } from '@playwright/test'

import { routes } from '../../../lib/utils/routes.js'

const initialToken = '1234-Houdini-Token-5678'
const updatedToken = 'updated-Houdini-Token-0000'

function isQuery(name: string) {
	return (request: Request) =>
		request.url().endsWith(routes.GraphQL) &&
		(request.postData()?.includes(`query ${name}`) ?? false)
}

const isActiveSessionQuery = isQuery('ActiveSessionAfterInvalidate')

test.describe('SvelteKit session refresh', () => {
	test('refreshes active queries with the new Houdini session', async ({ page }) => {
		const initialRequestPromise = page.waitForRequest(isActiveSessionQuery)
		await page.goto(routes.Stores_Session_Refresh)

		const initialRequest = await initialRequestPromise
		expect(initialRequest.headers().authorization).toBe(`Bearer ${initialToken}`)
		await expect(page.locator('#result')).toHaveText(initialToken)

		const [refetchRequest] = await Promise.all([
			page.waitForRequest(isActiveSessionQuery),
			page.waitForResponse((response) => response.url().endsWith('session-refresh/update')),
			page.getByRole('button', { name: 'Update session' }).click(),
		])

		expect(refetchRequest.headers().authorization).toBe(`Bearer ${updatedToken}`)
		await expect(page.locator('#result')).toHaveText(updatedToken)
	})

	test('leaves a query store that was never fetched alone', async ({ page }) => {
		const unfetchedRequests: Request[] = []
		page.on('request', (request) => {
			if (isQuery('UnfetchedAfterInvalidate')(request)) unfetchedRequests.push(request)
		})

		await page.goto(routes.Stores_Session_Refresh)
		await expect(page.locator('#result')).toHaveText(initialToken)

		await page.getByRole('button', { name: 'Update session' }).click()
		await expect(page.locator('#result')).toHaveText(updatedToken)

		expect(unfetchedRequests).toEqual([])
	})
})
