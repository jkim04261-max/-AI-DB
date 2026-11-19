import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(개인 마스터 DB 소유자 통제 및 보안 시스템) 2번: "관리자(Admin)
// 계정이라도 유저의 '개인 캐릭터/원본 지식' 데이터는 열람할 수
// 없도록" — /admin 화면 자체에 그런 열람 기능이 없다는 걸 확인한다
// (화면은 집계 숫자와 분류된 오류 종류만 보여준다). 지금까지 /admin
// e2e 테스트가 전혀 없었다.
function mockEmptyConversations(page: import('@playwright/test').Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

test.describe('관리자 화면', () => {
  test('관리자가 아니면 /admin 접근 시 홈으로 돌려보내진다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: { id: 1, email: 'alice@test.com' } })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await page.route('**/api/admin/stats', async (route) => {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '관리자만 접근할 수 있어요.' }) })
    })
    await page.route('**/api/admin/ai-usage', async (route) => {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '관리자만 접근할 수 있어요.' }) })
    })

    await page.goto('/admin')

    await expect(page).toHaveURL('/')
  })

  test('관리자는 집계 통계와 분류된 오류 종류만 본다 — 실제 오류 원문은 화면에 없다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: { id: 2, email: 'admin@test.com' } })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await page.route('**/api/admin/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: 42, conversations: 100, messages: 500, attachments: 12 }),
      })
    })
    await page.route('**/api/admin/ai-usage', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 10,
          success: 8,
          failed: 2,
          successRate: 80,
          today: 3,
          recentErrors: [{ id: 1, occurredAt: new Date().toISOString(), model: 'Gemini', kind: '일시적 오류(지연·과부하)' }],
        }),
      })
    })

    await page.goto('/admin')

    await expect(page.getByText('42')).toBeVisible()
    await expect(page.getByText('일시적 오류(지연·과부하)')).toBeVisible()
    // 서버가 더 이상 raw 오류 메시지(message 필드)를 내려주지 않으므로
    // 화면에도 분류명(kind)만 보이고, 원문 문구는 어디에도 없다.
    await expect(page.getByText('서버에 GEMINI_API_KEY가 설정되지 않았어요.')).toHaveCount(0)
    await expect(page.getByText('일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.')).toHaveCount(0)
  })
})
