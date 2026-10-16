import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, openChat } from './fixtures/mock-api'

// api/auth/me.ts only includes dailyQuestionLimit/remainingQuestions when
// DAILY_QUESTION_LIMIT_ENABLED=true (off by default in every real
// environment today — see PR #36/#38). These tests mock that response
// shape directly to verify the frontend's *rendering* of it, independent
// of whether the flag happens to be on anywhere real right now.

const USER = { id: 1, email: 'alice@test.com' }

async function openEmptyChat(page: import('@playwright/test').Page, id: number) {
  await page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [{ id, title: 'limit banner test', updated_at: new Date().toISOString() }] }) })
  })
  await page.route(`**/api/conversations/${id}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversation: { id, title: 'limit banner test', messages: [] } }) })
      return
    }
    await route.fallback()
  })
  await openChat(page, id)
}

test.describe('daily free-question banner', () => {
  test('shows remaining/limit when the flag is on and quota remains', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER, dailyQuestionLimit: 10, remainingQuestions: 7 })
    await openEmptyChat(page, 20)

    await expect(page.getByText('오늘 남은 무료 질문: 7/10')).toBeVisible()
  })

  test('shows the exhausted notice when remaining is 0', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER, dailyQuestionLimit: 10, remainingQuestions: 0 })
    await openEmptyChat(page, 21)

    await expect(page.getByText('오늘의 무료 질문 10회를 모두 사용했습니다. 내일 다시 이용할 수 있습니다.')).toBeVisible()
    await expect(page.getByText(/오늘 남은 무료 질문/)).toHaveCount(0)
  })

  test('shows nothing when the feature flag is off (today\'s real default everywhere)', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER }) // no dailyQuestionLimit/remainingQuestions fields at all
    await openEmptyChat(page, 22)

    await expect(page.getByText(/무료 질문/)).toHaveCount(0)
  })
})
