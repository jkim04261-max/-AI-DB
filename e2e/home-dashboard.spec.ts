import { test, expect, type Page } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(메인 대시보드 전면 개편) 회귀 커버리지. ChatContext/GrowthContext가
// 앱 루트에서 항상 마운트되므로 /api/conversations·/api/character를 항상
// 모킹해야 한다(다른 e2e 파일들과 같은 이유).
const USER = { id: 1, email: 'alice@test.com' }

function mockConversations(page: Page, conversations: { id: number; title: string; updated_at: string }[]) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations }) })
  })
}

async function setup(page: Page, conversations: { id: number; title: string; updated_at: string }[] = []) {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockConversations(page, conversations)
  await mockEmptyCharacters(page)
  await page.goto('/')
}

test('the home screen shows only the logo/greeting and the 대화/AI 키우기 cards — no 6-card grid', async ({ page }) => {
  await setup(page)

  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: '오늘은 무엇을 해볼까요?' })).toBeVisible()
  await expect(main.getByRole('link', { name: /AI와 대화/ }).or(main.getByRole('button', { name: /AI와 대화/ }))).toBeVisible()
  await expect(main.getByRole('link', { name: /AI 키우기/ })).toBeVisible()

  // 예전 6카드 그리드의 나머지 항목들은 메인 화면에 더 이상 없어야 한다.
  await expect(page.getByRole('main').getByText('비서·직원 만들기')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('동영상 만들기')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('음악 만들기')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('미디어 만들기')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('문서·사진 분석')).toHaveCount(0)
})

test('clicking the AI 키우기 card navigates to /grow', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockConversations(page, [])
  // GrowPage는 캐릭터가 없어도 로그인 시점에 상단 리소스 바용
  // ?action=usage를 호출한다 — mockEmptyCharacters만으로는 부족하다
  // (다른 e2e의 /grow 이동 테스트와 같은 이유, e2e/mobile.spec.ts 참고).
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    if (route.request().method() === 'GET' && action === 'usage') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }),
      })
      return
    }
    if (route.request().method() === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return
    }
    await route.fallback()
  })
  await page.goto('/')

  await page.getByRole('main').getByRole('link', { name: /AI 키우기/ }).click()
  await expect(page).toHaveURL(/\/grow$/)
})

test('clicking the AI와 대화 card starts a new chat', async ({ page }) => {
  await setup(page)
  await page.route('**/api/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversation: { id: 99, title: '새 대화' } }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })

  await page.getByRole('main').getByRole('button', { name: /AI와 대화/ }).click()
  await expect(page).toHaveURL(/\/chat\/99$/)
})

test('sidebar no longer shows 비서·직원 만들기, and 동영상/음악 are merged into a single 미디어 만들기 (준비 중) item', async ({
  page,
}) => {
  await setup(page)

  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('비서·직원 만들기')).toHaveCount(0)
  await expect(sidebar.getByText('동영상 만들기')).toHaveCount(0)
  await expect(sidebar.getByText('음악 만들기')).toHaveCount(0)

  const media = sidebar.getByText('미디어 만들기', { exact: true })
  await expect(media).toBeVisible()
  await expect(sidebar.getByText('준비 중')).toBeVisible()

  await media.click()
  await expect(page.getByText('현재 준비 중인 기능입니다.')).toBeVisible()
})

test('sidebar 문서·사진 분석 still routes to the existing /category/document entry point', async ({ page }) => {
  await setup(page)
  await page.locator('aside').getByText('문서·사진 분석').click()
  await expect(page).toHaveURL(/\/category\/document$/)
})

// 지시서(직업 카드 맞추기 게임 연동): 이미 있던 /card-match 라우트로
// 들어갈 입구가 사이드바에 새로 생겼는지 확인 — 메인 대시보드([대화]/
// [AI 키우기] 2개 카드 레이아웃)는 전혀 건드리지 않았으므로 여기서는
// 안 늘어났는지도 함께 확인한다.
test('sidebar 직업 카드 맞추기 routes to /card-match, and the home screen 2-card layout is unaffected', async ({ page }) => {
  await setup(page)
  await page.locator('aside').getByText('직업 카드 맞추기').click()
  await expect(page).toHaveURL(/\/card-match$/)

  await page.goto('/')
  const main = page.getByRole('main')
  await expect(main.getByText('직업 카드 맞추기')).toHaveCount(0)
})

test('sidebar library section shows a coming-soon notice, and recent chats scroll list links to each conversation', async ({
  page,
}) => {
  await setup(page, [
    { id: 1, title: '여행 계획 짜기', updated_at: new Date().toISOString() },
    { id: 2, title: '파이썬 코드 디버깅', updated_at: new Date().toISOString() },
  ])

  const sidebar = page.locator('aside')
  await expect(sidebar.getByText('라이브러리')).toBeVisible()
  await sidebar.getByText('라이브러리').click()
  await expect(page.getByText('현재 준비 중인 기능입니다.')).toBeVisible()

  await expect(sidebar.getByText('여행 계획 짜기')).toBeVisible()
  await expect(sidebar.getByText('파이썬 코드 디버깅')).toBeVisible()

  await page.route('**/api/conversations/1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversation: { id: 1, title: '여행 계획 짜기', messages: [] } }),
      })
      return
    }
    await route.fallback()
  })
  await sidebar.locator('a[href="/chat/1"]').click()
  await expect(page).toHaveURL(/\/chat\/1$/)
})
