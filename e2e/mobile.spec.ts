import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// Runs only under the `mobile-chromium` project (see playwright.config.ts),
// which uses a phone-sized viewport/UA via devices['Pixel 7'].
const USER = { id: 1, email: 'alice@test.com' }

test('the mobile bottom nav is visible and basic navigation works', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })

  await page.goto('/')

  const bottomNav = page.getByRole('navigation').last()
  await expect(bottomNav).toBeVisible()
  await expect(bottomNav.getByText('홈')).toBeVisible()
  await expect(bottomNav.getByText('대화')).toBeVisible()

  await bottomNav.getByText('대화').click()
  await expect(page).toHaveURL('/chat')
  await expect(page.getByRole('heading', { name: '대화' })).toBeVisible()

  await bottomNav.getByText('홈').click()
  await expect(page).toHaveURL('/')
})

test('the login screen renders without horizontal overflow on a phone-width viewport', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: null })

  await page.goto('/login')
  await expect(page.getByPlaceholder('이메일')).toBeVisible()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
