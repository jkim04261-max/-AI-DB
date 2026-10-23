import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// AI 키우기 (누리/두리 캐릭터 생성) — all mocked, no real DB. See
// e2e/README.md. ChatProvider also mounts at the app root and fetches
// /api/conversations as soon as a user is set, regardless of which page is
// open, so every authenticated test here mocks that too even though it's
// unrelated to the character feature itself.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

// PR #46: GrowPage now also fires GET ?action=messages/exam for the
// "오늘의 목표"/"최근 기록" hints whenever a character is selected, so the
// bare '**/api/character' pattern (no query string match) used throughout
// this file needs a query-aware router with safe defaults for those two,
// alongside each test's own GET (list)/POST (create)/PATCH (profession)
// handling.
function mockCharacterApi(
  page: Page,
  handle: (route: Route, action: string | null, method: string) => Promise<boolean>,
) {
  return page.route('**/api/character**', async (route) => {
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
    const handled = await handle(route, action, method)
    if (!handled) await route.fallback()
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
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return true
    }
    return false
  })

  await page.goto('/grow')

  await expect(page.getByRole('button', { name: '누리 만들기 (남)' })).toBeVisible()
  await expect(page.getByRole('button', { name: '두리 만들기 (여)' })).toBeVisible()
})

test('creating 누리 shows its card and removes only its own button', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return true
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON() as { companionType: string }
      const created = { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()

  // PR #46: 캐릭터 이름은 전환 탭과 HUD 양쪽에 보이므로, 스프라이트의
  // 고유한 접근성 이름으로 "누리가 떴다"를 확인한다(가장 모호하지 않은
  // 증거). 어린이 단계 표시는 HUD 한 곳에만 있어 그대로 둔다.
  await expect(page.getByRole('img', { name: '누리 캐릭터, 대기 중' })).toBeVisible()
  await expect(page.getByText('어린이', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '누리 만들기 (남)' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '두리 만들기 (여)' })).toBeVisible()
})

test('a user who already has both characters sees no creation UI, just their cards', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [
            { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() },
            { id: 2, user_id: USER.id, companion_type: 'duri', stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() },
          ],
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')

  // PR #46: 캐릭터 전환 탭에 누리/두리가 모두 뜨는지 확인(한 번에 한
  // 캐릭터만 중심에 보이는 구조라, 선택되지 않은 쪽은 탭으로만 존재).
  await expect(page.getByRole('button', { name: '누리', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '두리', exact: true })).toBeVisible()
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
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() }],
        }),
      })
      return true
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { companionType: string; profession: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: body.profession, level: 1, exp: 0, created_at: new Date().toISOString() },
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')

  await expect(page.getByText('직업 미선택')).toBeVisible()
  await page.getByRole('button', { name: '직업 선택' }).click()
  await page.getByRole('button', { name: '회계사' }).click()

  // No confirmation dialog for a first-time pick.
  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(page.getByText('직업 미선택')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /직업 변경/ })).toBeVisible()
})

test('changing an already-selected profession shows a confirmation dialog before saving', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', level: 1, exp: 0, created_at: new Date().toISOString() }],
        }),
      })
      return true
    }
    if (method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'singer', level: 1, exp: 0, created_at: new Date().toISOString() },
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')

  // PR #46: 직업명이 HUD 배지와 "오늘의 목표" 문구 양쪽에 나타날 수 있어
  // (예: "회계사 자격시험에 도전해보세요"), 모호하지 않게 HUD의 직업
  // 배지(data-testid)로 범위를 좁혀 확인한다.
  const professionBadge = page.getByTestId('profession-badge')
  await expect(professionBadge).toHaveText('회계사')
  await page.getByRole('button', { name: '직업 변경' }).click()
  await page.getByRole('button', { name: '가수' }).click()

  // The change needs confirmation before it's applied.
  await expect(page.getByText('직업을 변경할까요?')).toBeVisible()
  await expect(professionBadge).toHaveText('회계사') // still the old job until confirmed

  await page.getByRole('button', { name: '변경', exact: true }).click()

  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(professionBadge).toHaveText('가수')
})

test('cancelling the change confirmation keeps the original profession', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let patchCalled = false
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', level: 1, exp: 0, created_at: new Date().toISOString() }],
        }),
      })
      return true
    }
    if (method === 'PATCH') {
      patchCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: {} }) })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '직업 변경' }).click()
  await page.getByRole('button', { name: '가수' }).click()
  const confirmDialog = page.locator('div').filter({ hasText: '직업을 변경할까요?' }).last()
  await expect(confirmDialog).toBeVisible()

  await confirmDialog.getByRole('button', { name: '취소' }).click()

  await expect(page.getByText('직업을 변경할까요?')).toHaveCount(0)
  await expect(page.getByTestId('profession-badge')).toHaveText('회계사')
  expect(patchCalled).toBe(false)
})
