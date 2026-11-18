import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// 지시서(지역 기반 2.5D 동네 및 직업 건물 건설 시스템) — all mocked, no
// real DB/Gemini/Vercel call. See e2e/README.md. ChatProvider also mounts
// at the app root and fetches /api/conversations as soon as a user is
// set, so every test here mocks that too even though it's unrelated.
const USER = { id: 1, email: 'alice@test.com' }
const NURI_ACCOUNTANT = {
  id: 1,
  user_id: USER.id,
  companion_type: 'nuri',
  stage: 'child',
  profession: 'accountant',
  level: 1,
  exp: 0,
  age_tier: 'toddler',
  created_at: new Date().toISOString(),
}

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

// 이 페이지(GrowPage)는 캐릭터가 하나라도 있으면 메인 화면을 그리면서
// messages/knowledge/exam/usage를 미리 불러온다 — 이 파일의 테스트들은
// 그 값 자체를 다루지 않으므로 항상 같은 빈/기본 응답을 돌려준다.
async function mockCharacterApi(
  page: Page,
  options: {
    characters?: unknown[]
    onGetBuilding?: (route: Route) => Promise<void>
    onRegisterBuilding?: (route: Route) => Promise<void>
  },
) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'messages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'knowledge') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'exam') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    if (method === 'GET' && action === 'usage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
      return
    }
    if (method === 'GET' && action === 'building') {
      if (options.onGetBuilding) {
        await options.onGetBuilding(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ building: null }) })
      return
    }
    if (method === 'POST' && action === 'register-building') {
      if (options.onRegisterBuilding) {
        await options.onRegisterBuilding(route)
        return
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'unexpected' }) })
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: options.characters ?? [] }) })
      return
    }
    await route.fallback()
  })
}

// GrowPage는 "일하는 지역"/직업 이력을 로컬 스토리지에서만 읽는다(PR
// #132, 서버에는 저장하지 않음) — 이 테스트들은 첫 방문 온보딩이 아니라
// "이미 프로필을 작성해 둔 재방문 유저"를 흉내 내므로, 앱이 뜨기 전에
// addInitScript로 미리 그 값을 심어둔다.
function seedProfile(page: Page, { region, workplaceName }: { region: string; workplaceName?: string }) {
  return page.addInitScript(
    ({ userId, region, workplaceName }) => {
      window.localStorage.setItem(`nuri-ai:region:${userId}:nuri`, region)
      if (workplaceName) {
        window.localStorage.setItem(
          `nuri-ai:job-history:${userId}:nuri`,
          JSON.stringify({ workplaceName, industry: '', careerStartMonth: '', visibility: 'private' }),
        )
      }
    },
    { userId: USER.id, region, workplaceName },
  )
}

test('entering the main screen with a saved region shows the 2.5D town background, then returns to the usual main screen', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await seedProfile(page, { region: '경기도 일산 정발산동' })
  await mockCharacterApi(page, { characters: [NURI_ACCOUNTANT] })

  await page.goto('/grow')

  await expect(page.getByTestId('town-entry-overlay')).toBeVisible()
  await expect(page.getByTestId('town-entry-region-label')).toContainText('경기도 일산 정발산동')
  // 상호명을 등록한 적이 없으므로 [내 가게 등록] 버튼은 뜨지 않는다.
  await expect(page.getByTestId('town-entry-register-open-button')).toHaveCount(0)

  await page.getByTestId('town-entry-primary-button').click()
  await expect(page.getByTestId('town-entry-overlay')).toBeHidden()
  // 오버레이가 사라진 뒤에는 평소와 같은 메인 화면(캐릭터 스프라이트)이
  // 그대로 보여야 한다 — 기존 학습 로직을 전혀 건드리지 않았는지 확인.
  await expect(page.getByRole('img', { name: '누리 캐릭터, 대기 중' })).toBeVisible()
})

test('a user with no saved region never sees the town overlay (old accounts keep the exact old main-screen flow)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_ACCOUNTANT] })

  await page.goto('/grow')

  await expect(page.getByRole('img', { name: '누리 캐릭터, 대기 중' })).toBeVisible()
  await expect(page.getByTestId('town-entry-overlay')).toHaveCount(0)
})

test('a user with a registered workplace name but no building yet can register one, then the overlay shows it as built', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await seedProfile(page, { region: '경기도 일산 정발산동', workplaceName: '자양청년치킨' })

  let registerCalled = false
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onGetBuilding: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ building: null }) })
    },
    onRegisterBuilding: async (route) => {
      registerCalled = true
      const body = route.request().postDataJSON() as { region: string; businessName: string }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          building: { id: 1, region: body.region, businessName: body.businessName, createdAt: new Date().toISOString(), isOwner: true },
        }),
      })
    },
  })

  await page.goto('/grow')

  await expect(page.getByTestId('town-entry-overlay')).toBeVisible()
  await page.getByTestId('town-entry-register-open-button').click()
  await expect(page.getByTestId('town-entry-register-modal')).toBeVisible()
  await expect(page.getByTestId('town-entry-business-name-input')).toHaveValue('자양청년치킨')

  await page.getByTestId('town-entry-register-submit').click()

  expect(registerCalled).toBe(true)
  await expect(page.getByTestId('town-entry-register-modal')).toHaveCount(0)
  await expect(page.getByText('‘자양청년치킨’ 건물이 보여요!')).toBeVisible()
  await expect(page.getByTestId('town-entry-primary-button')).toHaveText('입장하기')
})

test('registering an already-taken business name shows the exact duplicate-name alert and blocks creation', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await seedProfile(page, { region: '경기도 일산 정발산동', workplaceName: '자양청년치킨' })

  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onGetBuilding: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ building: null }) })
    },
    onRegisterBuilding: async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: '이미 등록된 상호명입니다. 다른 이름을 사용해 주세요' }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByTestId('town-entry-register-open-button').click()
  await page.getByTestId('town-entry-register-submit').click()

  await expect(page.getByTestId('town-entry-register-error')).toHaveText('이미 등록된 상호명입니다. 다른 이름을 사용해 주세요')
  // 차단됐으므로 모달이 그대로 열려 있어야 한다.
  await expect(page.getByTestId('town-entry-register-modal')).toBeVisible()
})

test('a workplace name that already matches another user\'s registered building skips straight to entering it (no register button)', async ({
  page,
}) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await seedProfile(page, { region: '경기도 일산 정발산동', workplaceName: '모두의 회사' })

  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onGetBuilding: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          building: { id: 9, region: '경기도 일산 정발산동', businessName: '모두의 회사', createdAt: new Date().toISOString(), isOwner: false },
        }),
      })
    },
  })

  await page.goto('/grow')

  await expect(page.getByText('‘모두의 회사’ 건물이 보여요!')).toBeVisible()
  await expect(page.getByTestId('town-entry-register-open-button')).toHaveCount(0)
  await expect(page.getByTestId('town-entry-primary-button')).toHaveText('입장하기')
})
