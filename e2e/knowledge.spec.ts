import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// 지식 가르치기 + Gemini 검증 (PR #44) — all mocked, no real DB/Gemini call.
// See e2e/README.md. ChatProvider also mounts at the app root and fetches
// /api/conversations as soon as a user is set, so every test here mocks
// that too even though it's unrelated to this feature.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

// A single route registration that dispatches on method + ?action= for
// every /api/character call this spec needs — the exact-match
// '**/api/character' pattern used elsewhere in the test suite doesn't
// match a URL carrying a query string, so this file handles its own
// character/knowledge routing instead of reusing mockEmptyCharacters.
async function mockCharacterApi(
  page: Page,
  options: {
    characters?: unknown[]
    onVerify?: (route: Route) => Promise<void>
    onSave?: (route: Route) => Promise<void>
    onListKnowledge?: (route: Route) => Promise<void>
  },
) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'knowledge' && options.onListKnowledge) {
      await options.onListKnowledge(route)
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: options.characters ?? [] }),
      })
      return
    }
    if (method === 'POST' && action === 'verify-knowledge' && options.onVerify) {
      await options.onVerify(route)
      return
    }
    if (method === 'POST' && action === 'save-knowledge' && options.onSave) {
      await options.onSave(route)
      return
    }
    await route.fallback()
  })
}

const NURI_ACCOUNTANT = { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', created_at: new Date().toISOString() }
const NURI_NO_PROFESSION = { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, created_at: new Date().toISOString() }

test('a character with no profession shows guidance instead of a teach form', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_NO_PROFESSION] })

  await page.goto('/grow')

  await expect(page.getByText('먼저 직업을 선택해주세요.')).toBeVisible()
  await expect(page.getByRole('button', { name: /지식 가르치기/ })).toHaveCount(0)
})

test('verifying appropriate knowledge shows the result and enables 저장, which is not sent until clicked', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCalled = false
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCalled = true
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: {
            id: 1,
            character_id: 1,
            profession: 'accountant',
            title: '복식부기',
            original_content: '거래를 두 번 기록한다',
            final_content: '거래를 두 번 기록한다',
            verification_status: 'appropriate',
            verification_explanation: '정확해요',
            created_at: new Date().toISOString(),
          },
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: /지식 가르치기/ }).click()
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  await page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.').fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()

  await expect(page.getByText('적합', { exact: true })).toBeVisible()
  await expect(page.getByText('설명: 정확해요')).toBeVisible()
  await expect(page.getByText('오늘 남은 지식 검증 횟수: 9/10')).toBeVisible()

  const saveButton = page.getByRole('button', { name: '저장' })
  await expect(saveButton).toBeEnabled()
  expect(saveCalled).toBe(false) // verifying never auto-saves

  await saveButton.click()
  await expect(page.getByText('학습 기록으로 저장했어요.')).toBeVisible()
  expect(saveCalled).toBe(true)
})

test('needs_revision disables 저장 and shows guidance to revise and re-verify', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'needs_revision', explanation: '일부 틀렸어요', relevance: '관련 있음', issues: '연도 오류', suggestion: '연도를 고치세요' },
          remaining: 8,
          dailyTeachLimit: 10,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: /지식 가르치기/ }).click()
  await page.getByPlaceholder('지식 제목').fill('틀린지식')
  await page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.').fill('잘못된 내용')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()

  await expect(page.getByText('수정 필요', { exact: true })).toBeVisible()
  await expect(page.getByText('내용을 수정한 후 다시 검증해주세요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
})

test('editing content after a result makes it stale and requires re-verifying before saving', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' },
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: /지식 가르치기/ }).click()
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  const contentBox = page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.')
  await contentBox.fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()
  await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()

  await contentBox.fill('거래를 두 번 기록한다 (수정)')

  await expect(page.getByText('내용이 바뀌었어요. 저장하려면 다시 검증해주세요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
})

test('the learning-record list shows saved entries with their verification status', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onListKnowledge: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 1,
          entries: [
            {
              id: 1,
              character_id: 1,
              profession: 'accountant',
              title: '복식부기',
              original_content: '거래를 두 번 기록한다',
              final_content: '거래를 두 번 기록한다',
              verification_status: 'appropriate',
              verification_explanation: '정확해요',
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: /지식 가르치기/ }).click()
  await page.getByRole('button', { name: /학습 기록/ }).click()

  await expect(page.getByText('복식부기')).toBeVisible()
  await expect(page.getByText('(1개)')).toBeVisible()
})
