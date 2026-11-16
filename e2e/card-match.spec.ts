import { test, expect, type Page } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(사이드바 '직업 카드 맞추기' 메뉴 삭제): 예전엔 이 파일이 독립
// 라우트 /card-match(CardMatchPage, 자체 useMockWallet 잔액)를
// 테스트했지만, App.tsx에서 그 라우트 등록 자체를 뺐다 — CardMatchGame
// 컴포넌트는 이제 '가르치기' 모달의 teen(10대) 커리큘럼 ②단계 안에서만
// 쓰인다(그 흐름의 회귀 테스트는
// e2e/knowledge.spec.ts의 "completing the teen (10대) 10-step
// curriculum..." 테스트가 담당한다). 이 파일은 "기존 파일 삭제 금지"
// 규칙에 따라 지우지 않고, /card-match가 더 이상 그 화면을 보여주지
// 않는다는 것만 확인하도록 남겨둔다.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

async function setup(page: Page) {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockEmptyCharacters(page)
  await page.goto('/card-match')
}

test('/card-match no longer renders the standalone card-match game (route removed)', async ({ page }) => {
  await setup(page)

  await expect(page.getByRole('heading', { name: '직업 카드 맞추기' })).toHaveCount(0)
  await expect(page.getByTestId('card-match-back')).toHaveCount(0)
})
