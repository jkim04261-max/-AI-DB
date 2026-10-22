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
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, created_at: new Date().toISOString() },
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
  // PR #45 checkpoint 2: the card shows a 2D CharacterSprite (idle pose by
  // default) instead of the old generic sprout icon.
  await expect(page.getByRole('img', { name: '누리 캐릭터, 대기 중' })).toBeVisible()
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
          { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, created_at: new Date().toISOString() },
          { id: 2, user_id: USER.id, companion_type: 'duri', stage: 'child', profession: null, created_at: new Date().toISOString() },
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
        characters: [{ id: 1, user_id: USER.id, companion_type: 'duri', stage: 'child', profession: 'singer', created_at: new Date().toISOString() }],
      }),
    })
  })

  await page.goto('/mypage')

  await expect(page.getByText('내 AI')).toBeVisible()
  await expect(page.getByText('두리', { exact: true })).toBeVisible()
  await expect(page.getByText('어린이 · 가수')).toBeVisible()
  // Pre-existing My Page content must still be there, untouched. (The
  // sidebar also shows a "무료 플랜" badge next to the user's email, so
  // this is scoped to the page's <main> content, not the sidebar.)
  await expect(page.getByRole('main').getByText('무료 플랜')).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI 키우기로 이동' })).toBeVisible()
})

test('a character with no profession shows "직업 미선택" and selecting one needs no confirmation', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, created_at: new Date().toISOString() }],
        }),
      })
      return
    }
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { companionType: string; profession: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: body.profession, created_at: new Date().toISOString() },
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')

  await expect(page.getByText('직업 미선택')).toBeVisible()
  await page.getByRole('button', { name: '직업 선택' }).click()
  await page.getByRole('button', { name: '회계사' }).click()

  // No confirmation dialog for a first-time pick.
  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(page.getByText('직업 미선택')).toHaveCount(0)
  await expect(page.getByText('회계사')).toBeVisible()
})

test('changing an already-selected profession shows a confirmation dialog before saving', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await page.route('**/api/character', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', created_at: new Date().toISOString() }],
        }),
      })
      return
    }
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'singer', created_at: new Date().toISOString() },
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')

  await expect(page.getByText('회계사')).toBeVisible()
  await page.getByRole('button', { name: '직업 변경' }).click()
  await page.getByRole('button', { name: '가수' }).click()

  // The change needs confirmation before it's applied.
  await expect(page.getByText('직업을 변경할까요?')).toBeVisible()
  await expect(page.getByText('회계사')).toBeVisible() // still the old job until confirmed

  await page.getByRole('button', { name: '변경' }).click()

  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('가수')).toBeVisible()
})

test('cancelling the change confirmation keeps the original profession', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let patchCalled = false
  await page.route('**/api/character', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', created_at: new Date().toISOString() }],
        }),
      })
      return
    }
    if (route.request().method() === 'PATCH') {
      patchCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: {} }) })
      return
    }
    await route.fallback()
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '직업 변경' }).click()
  await page.getByRole('button', { name: '가수' }).click()
  const confirmDialog = page.locator('div').filter({ hasText: '직업을 변경할까요?' }).last()
  await expect(confirmDialog).toBeVisible()

  await confirmDialog.getByRole('button', { name: '취소' }).click()

  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('회계사')).toBeVisible()
  expect(patchCalled).toBe(false)
})
