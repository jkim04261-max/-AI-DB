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
    // PR #47 체크포인트 1: GrowPage는 이제 메인 화면 스탯 게이지용으로
    // GET ?action=knowledge도 캐릭터 선택 시마다 미리 불러온다 — 이
    // 파일의 테스트들은 그 값 자체를 검증하지 않으므로 빈 목록 기본값만
    // 둔다.
    if (method === 'GET' && action === 'knowledge') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    // PR #49: 상단 리소스 바의 "행동력"용 GET ?action=usage 기본값.
    if (method === 'GET' && action === 'usage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
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
  await expect(page.getByTestId('character-create-nuri')).toHaveCount(0)
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

  await expect(page.getByTestId('character-create-nuri')).toBeVisible()
  await expect(page.getByTestId('character-create-duri')).toBeVisible()
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
  await page.getByTestId('character-create-nuri').click()
  // Stage 1(오프닝 프로필): 이제 클릭 즉시 생성되지 않고, 이름·생일·
  // 거주지역·직업을 입력받는 화면을 먼저 거친다 — 전부 선택값이라
  // 이름(기본값 "누리")만 그대로 두고 바로 시작해도 된다.
  await expect(page.getByTestId('opening-profile-screen')).toBeVisible()
  await page.getByTestId('opening-profile-start-button').click()

  // PR #46: 캐릭터 이름은 전환 탭과 HUD 양쪽에 보이므로, 스프라이트의
  // 고유한 접근성 이름으로 "누리가 떴다"를 확인한다(가장 모호하지 않은
  // 증거). 어린이 단계 표시는 HUD 한 곳에만 있어 그대로 둔다.
  await expect(page.getByRole('img', { name: '누리 캐릭터, 대기 중' })).toBeVisible()
  await expect(page.getByText('어린이', { exact: true })).toBeVisible()
  await expect(page.getByTestId('character-create-nuri')).toHaveCount(0)
  await expect(page.getByTestId('character-create-duri')).toBeVisible()
  // Stage 1: 온보딩을 거치면 체험판 가상 용돈 100,000원이 즉시 뜬다
  // (GROW_INITIAL_ALLOWANCE_WON, 지시서에 따라 1,000,000원→100,000원).
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')
})

// Stage 1(오프닝 프로필): 취소하면 캐릭터가 생성되지 않고 그대로
// 생성 버튼 화면으로 돌아간다.
test('cancelling the opening profile screen creates no character', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let postCalled = false
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return true
    }
    if (method === 'POST') {
      postCalled = true
      return false
    }
    return false
  })

  await page.goto('/grow')
  await page.getByTestId('character-create-nuri').click()
  await expect(page.getByTestId('opening-profile-screen')).toBeVisible()
  await page.getByTestId('opening-profile-cancel-button').click()

  await expect(page.getByTestId('opening-profile-screen')).toHaveCount(0)
  await expect(page.getByTestId('character-create-nuri')).toBeVisible()
  expect(postCalled).toBe(false)
})

// Stage 1: 자유 입력한 직업이 실제로 PATCH(?action 없는 PATCH)에
// profession='custom' + 입력한 라벨로 실려가는지 확인한다 — PR #65의
// 자유 직업 입력 경로를 온보딩에서도 그대로 재사용한다는 증거.
test('entering a profession in the opening profile screen saves it as a free-text profession', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let patchBody: { companionType?: string; profession?: string; customProfessionLabel?: string } | null = null
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
    if (method === 'PATCH') {
      patchBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: {
            id: 1,
            user_id: USER.id,
            companion_type: 'nuri',
            stage: 'child',
            profession: 'custom',
            custom_profession_label: '숲해설가',
            level: 1,
            exp: 0,
            created_at: new Date().toISOString(),
          },
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()

  await expect(page.getByTestId('profession-badge')).toHaveText('숲해설가')
  expect(patchBody).toMatchObject({ companionType: 'nuri', profession: 'custom', customProfessionLabel: '숲해설가' })
})

// 지시서(성별 필드 제거): PR #97에서 추가했던 플레이버 전용 "성별" 필드가
// — 아무리 문서화해도 "내가 고른 성별대로 캐릭터가 정해진다"는 오해를
// 반복적으로 일으켜(실제 사용자 신고 다수) 완전히 제거했다. 어느 캐릭터
// (누리/두리)를 키울지는 버튼 클릭 시점에 이미 정해져 있고, 이 화면에는
// 그걸 바꾸거나 혼동할 만한 입력이 더 이상 없어야 한다는 걸 고정하는
// 회귀 테스트다.
test('the opening profile screen has no gender field — removed after it repeatedly confused users into thinking it controlled which character was created', async ({
  page,
}) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let postBody: { companionType?: string } | null = null
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) })
      return true
    }
    if (method === 'POST') {
      postBody = route.request().postDataJSON()
      const created = { id: 1, user_id: USER.id, companion_type: postBody?.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByTestId('character-create-nuri').click()

  await expect(page.getByTestId('opening-profile-gender-male')).toHaveCount(0)
  await expect(page.getByTestId('opening-profile-gender-female')).toHaveCount(0)
  await expect(page.getByText('성별')).toHaveCount(0)

  await page.getByTestId('opening-profile-start-button').click()
  expect(postBody).toMatchObject({ companionType: 'nuri' })
})

// 지시서(캐릭터 인사말 말풍선): 프로필 생성 직후 0.5초 뒤 페이드인되는
// 인사말 — 입력한 이름/직업이 그대로 들어가는지, 기존 showBubble의
// 기본 지속시간(3.2초)이 아니라 이 인사말만의 더 긴 지속시간(5초)이
// 적용되는지 확인한다.
test('the opening greeting bubble fades in ~0.5s after onboarding, shows the entered name/profession, and lasts longer than the default bubble duration', async ({
  page,
}) => {
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
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() } }),
      })
      return true
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: 'custom', custom_profession_label: body.customProfessionLabel, level: 1, exp: 0, created_at: new Date().toISOString() },
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-name-input').fill('신새별')
  await page.getByTestId('opening-profile-profession-input').fill('목욕도우미')
  await page.getByTestId('opening-profile-start-button').click()

  // 0.5초 지연 — 클릭 직후(인사말 타이머가 걸릴 시간조차 없는 시점)에는
  // 아직 안 떠 있어야 한다. CI처럼 느린 환경에서 "정확히 300ms" 같은
  // 고정 대기는 0.5초 지연과의 여유가 너무 좁아 간헐적으로 깨졌다
  // (이미 떠 있는데 "0이어야 한다"고 기대) — 대기 없이 클릭 바로
  // 다음에 확인해 그 여유를 없앴다.
  await expect(page.getByTestId('speech-bubble')).toHaveCount(0)

  await expect(page.getByTestId('speech-bubble')).toContainText(
    '안녕하세요, 신새별님이에요! 저는 목욕도우미입니다. 저를 가르쳐주세요?',
    { timeout: 3000 },
  )

  // 기존 showBubble 기본 지속시간(3.2초)이 지난 시점(총 경과 약 4초)에도
  // 여전히 떠 있어야 한다 — 이 인사말만 5초로 더 길게 설정됐다는 증거.
  await page.waitForTimeout(3300)
  await expect(page.getByTestId('speech-bubble')).toBeVisible()

  // 5초가 다 지난 시점(총 경과 약 5.8초)에는 자동으로 사라져 있어야 한다.
  await expect(page.getByTestId('speech-bubble')).toHaveCount(0, { timeout: 2500 })
})

test('clicking the character dismisses the opening greeting bubble early', async ({ page }) => {
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
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() } }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByTestId('character-create-duri').click()
  await page.getByTestId('opening-profile-name-input').fill('아름이')
  // 직업은 비워둔다 — 기본값(fallback) 문구로 이어지는지도 함께 확인.
  await page.getByTestId('opening-profile-start-button').click()

  await expect(page.getByTestId('speech-bubble')).toContainText('안녕하세요, 아름이님이에요! 저를 가르쳐주세요?', {
    timeout: 2000,
  })

  await page.getByTestId('character-tap-target').click()
  await expect(page.getByTestId('speech-bubble')).toHaveCount(0)
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

// 버그 수정(선택한 캐릭터·직업이 메인 화면에 반영되지 않는 문제): 두
// 캐릭터를 모두 가진 계정이 두리 탭을 보다가 새로고침/재접속하면,
// 이전에는 선택 상태가 전혀 기억되지 않아 항상 누리(직업 미선택)로
// 되돌아갔다. 마지막으로 본 탭을 복원해야 한다.
test('switching to 두리 and reloading keeps showing 두리 (not resetting to the 누리 default)', async ({ page }) => {
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
            {
              id: 2,
              user_id: USER.id,
              companion_type: 'duri',
              stage: 'child',
              profession: 'custom',
              custom_profession_label: '자전거 수리공',
              level: 1,
              exp: 0,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')
  // 기본값은 여전히 누리 탭이다(기존 동작 유지).
  await expect(page.getByTestId('profession-badge')).toHaveText('직업 미선택')

  await page.getByRole('button', { name: '두리', exact: true }).click()
  await expect(page.getByTestId('profession-badge')).toHaveText('자전거 수리공')

  await page.reload()
  await expect(page.getByTestId('profession-badge')).toHaveText('자전거 수리공')
  await expect(page.getByRole('img', { name: '두리 캐릭터, 대기 중' })).toBeVisible()
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

// PR #65('최종 통합 개발 명령서'): 고정 50개 직업 목록 대신 사용자가
// 자유롭게 직업을 타이핑할 수 있다 — "숲해설가" 예시로 그 흐름 전체를
// 확인한다(선택 → PATCH에 sentinel 'custom' + 실제 입력 텍스트 전송 →
// HUD 배지에 입력한 텍스트 그대로 표시, 고정 라벨이 아님).
test('entering a free-text profession ("숲해설가") sends sentinel profession "custom" and shows the typed label', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let patchBody: { companionType?: string; profession?: string; customProfessionLabel?: string } | null = null
  await mockCharacterApi(page, async (route, action, method) => {
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [
            { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: null, custom_profession_label: null, level: 1, exp: 0, focus_percent: 90, created_at: new Date().toISOString() },
          ],
        }),
      })
      return true
    }
    if (method === 'PATCH') {
      patchBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: {
            id: 1,
            user_id: USER.id,
            companion_type: 'nuri',
            stage: 'child',
            profession: 'custom',
            custom_profession_label: '숲해설가',
            level: 1,
            exp: 0,
            focus_percent: 90,
            created_at: new Date().toISOString(),
          },
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '직업 선택' }).click()
  await page.getByPlaceholder('예: 숲해설가').fill('숲해설가')
  await page.getByRole('button', { name: '이 직업으로 선택' }).click()

  await expect(page.getByTestId('profession-badge')).toHaveText('숲해설가')
  expect(patchBody).toMatchObject({ companionType: 'nuri', profession: 'custom', customProfessionLabel: '숲해설가' })
})

// PR #65: 집중력 게이지 — 교육·장비 단계에 따른 전체 반영은 PR #66에서
// 이어가지만, 지금도 캐릭터 행의 focus_percent가 화면에 그대로 보여야
// 한다.
test('shows the character\'s focus gauge percentage', async ({ page }) => {
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
            { id: 1, user_id: USER.id, companion_type: 'nuri', stage: 'child', profession: 'accountant', level: 1, exp: 0, focus_percent: 72, created_at: new Date().toISOString() },
          ],
        }),
      })
      return true
    }
    return false
  })

  await page.goto('/grow')

  await expect(page.getByTestId('focus-gauge')).toContainText('72%')
})
