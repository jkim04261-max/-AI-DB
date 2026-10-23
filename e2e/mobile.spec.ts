import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// Runs only under the `mobile-chromium` project (see playwright.config.ts),
// which uses a phone-sized viewport/UA via devices['Pixel 7'].
const USER = { id: 1, email: 'alice@test.com' }

test('the mobile bottom nav is visible and basic navigation works', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
  await mockEmptyCharacters(page)

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

// PR #46: the redesigned /grow game screen — phone-width checks (요청 6:
// 가로 스크롤 금지, 캐릭터가 잘리지 않음, 터치 버튼이 충분히 큼, 캐릭터와
// 핵심 행동이 첫 화면에서 보임).
test('the /grow game screen fits a phone width with no horizontal scroll, and shows the character and menu on first view', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()
    if (method === 'GET' && action === 'messages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'exam') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [
            { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'singer', level: 2, exp: 60, created_at: new Date().toISOString() },
          ],
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')

  // 캐릭터(스프라이트)와 핵심 게임 메뉴가 스크롤 없이 첫 화면에서 보인다.
  await expect(page.getByRole('img', { name: /누리 캐릭터/ })).toBeVisible()
  const teachButton = page.getByRole('button', { name: '가르치기' })
  await expect(teachButton).toBeVisible()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  // 터치 버튼은 충분히 커야 한다(최소 44px 높이를 목표로 설계됨).
  const box = await teachButton.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)

  // 캐릭터 스테이지 자체도 뷰포트 폭을 넘지 않는다(캐릭터가 잘리지 않음).
  const stage = page.getByRole('img', { name: /누리 캐릭터/ })
  const stageBox = await stage.boundingBox()
  expect(stageBox?.x ?? 0).toBeGreaterThanOrEqual(0)
  expect((stageBox?.x ?? 0) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(clientWidth)
})
