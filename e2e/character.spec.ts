import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// AI 키우기 (누리/두리 캐릭터 생성) — all mocked, no real DB. See
// e2e/README.md. ChatProvider also mounts at the app root and fetches
// /api/conversations as soon as a user is set, regardless of which page is
// open, so every authenticated test here mocks that too even though it's
// unrelated to the character feature itself.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: import('@playwright/test').Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

test('prompts a signed-out visitor to log in instead of showing the create UI', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: null })

  await page.goto('/grow')

  await expect(page.getByText('로그인하면 누리·두리를 키울 수 있어요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '누리 만들기 (남)' })).toHaveCount(0)
})

test('a signed-in user with no characters sees both creation buttons', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')

  await expect(page.getByRole('button', { name: '누리 만들기 (남)' })).toBeVisible()
  await expect(page.getByRole('button', { name: '두리 만들기 (여)' })).toBeVisible()
})

test('creating 누리 shows its card and removes only its own button', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { companionType: string }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', created_at: new Date().toISOString() },
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()

  await expect(page.getByText('누리', { exact: true })).toBeVisible()
  await expect(page.getByText('어린이', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '누리 만들기 (남)' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '두리 만들기 (여)' })).toBeVisible()
})

test('a user who already has both characters sees no creation UI, just their cards', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        characters: [
          { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', created_at: new Date().toISOString() },
          { id: 2, user_id: USER.id, companion_type: 'duri', stage: 'child', created_at: new Date().toISOString() },
        ],
      }),
    })
  })

  await page.goto('/grow')

  await expect(page.getByText('누리', { exact: true })).toBeVisible()
  await expect(page.getByText('두리', { exact: true })).toBeVisible()
  await expect(page.getByText('새 캐릭터 만들기')).toHaveCount(0)
})

test('the My Page "내 AI" section reflects the signed-in user\'s characters', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        characters: [{ id: 1, user_id: USER.id, companion_type: 'duri', stage: 'child', created_at: new Date().toISOString() }],
      }),
    })
  })

  await page.goto('/mypage')

  await expect(page.getByText('내 AI')).toBeVisible()
  await expect(page.getByText('두리', { exact: true })).toBeVisible()
  // Pre-existing My Page content must still be there, untouched. (The
  // sidebar also shows a "무료 플랜" badge next to the user's email, so
  // this is scoped to the page's <main> content, not the sidebar.)
  await expect(page.getByRole('main').getByText('무료 플랜')).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI 키우기로 이동' })).toBeVisible()
})
