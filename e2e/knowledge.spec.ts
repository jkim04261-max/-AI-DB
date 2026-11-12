import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'
import { ageTierForLevel } from '../src/data/characterAge'

// 지식 가르치기 + Gemini 검증 (PR #44) — all mocked, no real DB/Gemini call.
// See e2e/README.md. ChatProvider also mounts at the app root and fetches
// /api/conversations as soon as a user is set, so every test here mocks
// that too even though it's unrelated to this feature.
const USER = { id: 1, email: 'alice@test.com' }

// PR #63: 서버가 캐릭터 JSON에 age_tier를 함께 내려주기 시작했다 — 이
// 모의 응답들은 실제 서버의 진화 게이트를 거치지 않으므로
// (mission_unlocked_tier가 항상 null인 상태와 같다), 명시하지 않은
// 캐릭터는 실제 서버와 동일하게 level에서 계산한 값을 기본으로 채운다.
function withAgeTier(c: Record<string, unknown>): Record<string, unknown> {
  return { age_tier: ageTierForLevel(typeof c.level === 'number' ? c.level : 1), ...c }
}

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
    onStudyGenerate?: (route: Route) => Promise<void>
    onListMessages?: (route: Route) => Promise<void>
    onMissions?: (route: Route) => Promise<void>
    // 지시서(가르치기 완료 후 자동 식사 이벤트): 체험판 가상 용돈
    // 차감을 검증하려면 온보딩(캐릭터 생성 POST + 직업 저장 PATCH)도
    // 거쳐야 한다 — 이 두 액션 없는 쿼리는 action 파라미터가 없어
    // 기존 라우팅 분기에 없었다.
    onCreate?: (route: Route) => Promise<void>
    onSetProfession?: (route: Route) => Promise<void>
  },
) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'knowledge') {
      if (options.onListKnowledge) {
        await options.onListKnowledge(route)
        return
      }
      // PR #47 체크포인트 1: 메인 화면 스탯 게이지용으로 GrowPage가 이제
      // 캐릭터 선택 시마다 미리 불러오는 호출 — onListKnowledge를 지정하지
      // 않은 테스트(지식 목록 자체를 검증하지 않는 테스트)에는 빈 목록
      // 기본값을 둔다.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    // PR #45 checkpoint 3.6: InteractionPanel fetches the persisted
    // conversation log on mount — every test needs this mocked even if it
    // doesn't care about history, same reason mockEmptyConversations
    // exists for ChatContext.
    if (method === 'GET' && action === 'messages') {
      if (options.onListMessages) {
        await options.onListMessages(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    // PR #46: GrowPage now eagerly fetches exam status (for the "오늘의
    // 목표" hint) whenever a character has a profession — default to
    // "not passed yet" since these tests aren't about the exam flow.
    if (method === 'GET' && action === 'exam') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    // PR #49: 상단 리소스 바의 "행동력"용 GET ?action=usage 기본값.
    if (method === 'GET' && action === 'usage') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ characters: (options.characters ?? []).map((c) => withAgeTier(c as Record<string, unknown>)) }),
      })
      return
    }
    if (method === 'POST' && !action && options.onCreate) {
      await options.onCreate(route)
      return
    }
    if (method === 'PATCH' && !action && options.onSetProfession) {
      await options.onSetProfession(route)
      return
    }
    // PR #63: InteractionPanel이 열릴 때마다 6미션 진행상황을 조회한다 —
    // 이 파일의 테스트들은 진화 자체를 다루지 않으므로 항상 빈(0/6)
    // 기본값을 돌려준다.
    if (method === 'GET' && action === 'missions') {
      if (options.onMissions) {
        await options.onMissions(route)
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          missionProgress: {
            ageTier: 'toddler',
            ageTierLabel: '8~9살',
            byType: {
              objective: { type: 'objective', confirmed: 0, required: 2, complete: false },
              subjective: { type: 'subjective', confirmed: 0, required: 2, complete: false },
              knowhow: { type: 'knowhow', confirmed: 0, required: 2, complete: false },
            },
            confirmedTotal: 0,
            requiredTotal: 6,
            allConfirmed: false,
            nextAgeTier: 'teen',
            nextAgeTierLabel: '10대',
          },
        }),
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
    if (method === 'POST' && action === 'study-generate' && options.onStudyGenerate) {
      await options.onStudyGenerate(route)
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

  await expect(page.getByText('직업을 선택하면 게임 메뉴를 쓸 수 있어요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '가르치기' })).toBeDisabled()
})

// PR #52 후속 요청 1번(5차에서 2~3살→8~9살로 상향): toddler 단계에서는
// 가르치기 폼에 쉬운 예시 주제가 떠서, 너무 어려운 지식만 쓰다가
// 거절당해 진도가 막히지 않도록 자연스럽게 유도한다. NURI_ACCOUNTANT는
// level을 안 줘서(기본값 1) toddler 단계다.
test('the teach form suggests age-appropriate example topics for a toddler-stage character, and clicking one fills the form', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_ACCOUNTANT] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('8~9살 단계에 맞는 예시예요', { exact: false })).toBeVisible()
  await page.getByTestId('topic-suggestion-chip').filter({ hasText: '이 직업이 하는 일' }).click()

  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('이 직업이 하는 일')
  await expect(page.getByTestId('knowledge-content-textarea')).not.toHaveValue('')
})

// PR #52: 연령 제한 지식 흡수 — 내용은 적합해도 캐릭터가 아직 너무 어리면
// (ageBlocked) 저장 버튼이 비활성화되고, 아동 말투의 거절 안내가 뜬다.
test('teaching a knowledge item too advanced for the character\'s current age tier shows a rejection notice and disables saving', async ({ page }) => {
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
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
          verificationToken: 'fake-token',
          characterReply: '아직은 너무 어려워서 이해하기 힘들어요! 20대가 되면 다시 가르쳐 주세요~',
          remaining: 9,
          dailyTeachLimit: 10,
          ageBlocked: true,
          characterAgeTier: 'toddler',
          requiredAgeTier: 'junior_20s',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await page.getByPlaceholder('지식 제목').fill('공인회계사 자격증 취득 절차')
  await page.getByTestId('knowledge-content-textarea').fill('시험 과목과 응시 자격을 포함한 절차.')
  await page.getByRole('button', { name: 'AI검증하기' }).click()

  await expect(page.getByText('아직은 너무 어려워서 이해하기 힘들어요! 20대가 되면 다시 가르쳐 주세요~')).toBeVisible()
  await expect(page.getByTestId('age-blocked-notice')).toBeVisible()
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()

  // PR #52 후속 요청 2번: 거절 직후에도 입력칸이 비어있지 않아서(위쪽
  // 기본 예시 칩은 안 보임) 바로 쉬운 지식으로 다시 시도할 수 있는 칩이
  // 거절 안내 바로 아래에 떠야 한다.
  await expect(page.getByText('지금 8~9살 단계에서는 이런 지식부터 가르쳐 보세요', { exact: false })).toBeVisible()
  await page.getByTestId('age-blocked-topic-suggestion-chip').filter({ hasText: '이 직업이 하는 일' }).click()

  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('이 직업이 하는 일')
  await expect(page.getByTestId('age-blocked-notice')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'AI검증하기' })).toBeEnabled()
})

// 지시서(가르치기 입력 화면 즉각 피드백): 직접 입력 텍스트 영역에
// 타이핑할 때마다 옆의 아이콘이 짧게 끄덕이고, AI검증이 "적합"으로
// 끝나면 미션 결과 카드 위로 별 파티클 8개가 뜬다. 둘 다 순수 시각
// 효과이며, 검증·저장 로직 자체(버튼 활성화, 저장 호출 시점 등)는
// 기존 테스트가 이미 검증하므로 여기서는 새 시각 효과만 확인한다.
test('typing in the teach textarea nods the icon, and an appropriate verification pops star particles', async ({ page }) => {
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
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
          verificationToken: 'mock-token-appropriate',
          characterReply: '정확해요! 알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('📌 직접 입력하기', { exact: true })).toBeVisible()
  await expect(page.getByTestId('teach-input-nod-icon')).toHaveCount(0)
  await page.getByTestId('knowledge-content-textarea').fill('거래를 두 번 기록한다')
  await expect(page.getByTestId('teach-input-nod-icon')).toBeVisible()
  // 문구 자체는 바뀌지 않아야 한다(e2e가 exact:true로 이 문구를 찾는
  // 기존 셀렉터에 영향 없어야 함).
  await expect(page.getByText('📌 직접 입력하기', { exact: true })).toBeVisible()

  await expect(page.getByTestId('teach-success-particle')).toHaveCount(0)
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  await page.getByRole('button', { name: 'AI검증하기' }).click()

  await expect(page.getByText('적합', { exact: true })).toBeVisible()
  await expect(page.getByTestId('teach-success-particle').first()).toBeVisible()
  expect(await page.getByTestId('teach-success-particle').count()).toBe(8)
})

test('verifying appropriate knowledge shows the result and enables 저장, which is not sent until clicked', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCalled = false
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
          verificationToken: 'mock-token-appropriate',
          characterReply: '정확해요! 알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCalled = true
      saveRequestBody = route.request().postDataJSON()
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
            source: 'user_taught',
            created_at: new Date().toISOString(),
          },
          savedReply: '이 지식을 배웠어요! 다음엔 또 어떤 걸 가르쳐 주실 건가요?',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  await page.getByTestId('knowledge-content-textarea').fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'AI검증하기' }).click()

  await expect(page.getByText('적합', { exact: true })).toBeVisible()
  await expect(page.getByText('설명: 정확해요')).toBeVisible()
  await expect(page.getByText('오늘 남은 지식 검증 횟수: 9/10')).toBeVisible()
  // PR #45 checkpoint 2: an appropriate verification briefly switches the
  // character sprite's pose to "happy" (CharacterSprite.tsx, wired from
  // KnowledgeTeachPanel's onPoseChange).
  await expect(page.getByRole('img', { name: /누리 캐릭터, 기뻐하는 중/ })).toBeVisible()

  const saveButton = page.getByRole('button', { name: '저장' })
  await expect(saveButton).toBeEnabled()
  expect(saveCalled).toBe(false) // verifying never auto-saves

  await saveButton.click()
  // PR #45 checkpoint 3: a static "saved" banner was replaced by a
  // character dialogue line in the unified interaction panel's feed.
  await expect(page.getByText('이 지식을 배웠어요!', { exact: false })).toBeVisible()
  expect(saveCalled).toBe(true)
  // The frontend must send the server-issued verificationToken, not a raw
  // verification object the server would have to trust as-is — this is
  // the client side of PR #44's follow-up security fix.
  expect(saveRequestBody?.verificationToken).toBe('mock-token-appropriate')
  expect(saveRequestBody?.verification).toBeUndefined()

  // Closing the teach panel (the bottom sheet) must reset the pose
  // immediately (not wait out the 2.5s auto-revert timer) — this is the
  // unmount-cleanup behavior in InteractionPanel's pose-timeout effect,
  // triggered now by closing the sheet rather than re-toggling a button.
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page.getByRole('img', { name: /누리 캐릭터, 대기 중/ })).toBeVisible()
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
          verificationToken: 'mock-token-needs-revision',
          characterReply: '일부 틀렸어요 혹시 "연도를 고치세요"는 어때요?',
          remaining: 8,
          dailyTeachLimit: 10,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('틀린지식')
  await page.getByTestId('knowledge-content-textarea').fill('잘못된 내용')
  await page.getByRole('button', { name: 'AI검증하기' }).click()

  await expect(page.getByText('수정 필요', { exact: true })).toBeVisible()
  await expect(page.getByText('내용을 수정한 후 다시 검증해주세요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  // PR #45 checkpoint 2: a needs_revision result briefly switches the
  // character sprite's pose to "sad".
  await expect(page.getByRole('img', { name: /누리 캐릭터, 아쉬워하는 중/ })).toBeVisible()
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
          verificationToken: 'mock-token-stale-check',
          characterReply: '정확해요! 알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  const contentBox = page.getByTestId('knowledge-content-textarea')
  await contentBox.fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'AI검증하기' }).click()
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
              source: 'user_taught',
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByRole('button', { name: /학습 기록/ }).click()

  await expect(page.getByText('복식부기')).toBeVisible()
  await expect(page.getByText('(1개)')).toBeVisible()
})

// --- PR #45 checkpoint 3: 통합 상호작용(가르치기 + 스스로 공부하기) ---

test('clicking 스스로 공부하기 fills in the generated knowledge, shows a character dialogue line, and can be saved', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCalled = false
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '복식부기', content: '거래를 차변과 대변에 동시에 기록한다.' },
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
          verificationToken: 'mock-token-study',
          characterReply: "오늘은 '복식부기'에 대해 혼자 공부해봤어요! 정확해요",
          remaining: 2,
          dailyStudyLimit: 3,
        }),
      })
    },
    onSave: async (route) => {
      saveCalled = true
      const body = route.request().postDataJSON() as Record<string, unknown>
      expect(body.verificationToken).toBe('mock-token-study')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: {
            id: 1,
            character_id: 1,
            profession: 'accountant',
            title: '복식부기',
            original_content: '거래를 차변과 대변에 동시에 기록한다.',
            final_content: '거래를 차변과 대변에 동시에 기록한다.',
            verification_status: 'appropriate',
            verification_explanation: '정확해요',
            source: 'ai_generated',
            created_at: new Date().toISOString(),
          },
          savedReply: '이 지식을 학습 기록에 저장했어요! 다음엔 또 무엇을 공부해볼까요?',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()

  // The composer is filled with what the character generated, so the user
  // can review it before saving — self-study never auto-saves either.
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('복식부기')
  await expect(page.getByTestId('knowledge-content-textarea')).toHaveValue('거래를 차변과 대변에 동시에 기록한다.')
  // The character "explains in its own words" what it studied.
  await expect(page.getByText(/오늘은 '복식부기'에 대해 혼자 공부해봤어요/)).toBeVisible()
  await expect(page.getByText('오늘 남은 스스로 공부하기 횟수: 2/3')).toBeVisible()

  const saveButton = page.getByRole('button', { name: '저장' })
  await expect(saveButton).toBeEnabled()
  expect(saveCalled).toBe(false)

  await saveButton.click()
  await expect(page.getByText('이 지식을 학습 기록에 저장했어요!', { exact: false })).toBeVisible()
  expect(saveCalled).toBe(true)
})

test('teaching and self-study both happen in the same panel, building one shared dialogue feed (not separate modes)', async ({ page }) => {
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
          verificationToken: 'mock-token-teach',
          characterReply: '정확해요! 알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '발생주의', content: '수익과 비용은 발생한 시점에 인식한다.' },
          verification: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' },
          verificationToken: 'mock-token-study-2',
          characterReply: "오늘은 '발생주의'에 대해 혼자 공부해봤어요! 정확해요",
          remaining: 2,
          dailyStudyLimit: 3,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  // Teach first.
  await page.getByPlaceholder('지식 제목').fill('복식부기')
  await page.getByTestId('knowledge-content-textarea').fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'AI검증하기' }).click()
  await expect(page.getByText('알려주셔서 고마워요!', { exact: false })).toBeVisible()

  // Then self-study, in the exact same panel — no navigation, no mode
  // switch, no separate screen.
  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await expect(page.getByText(/오늘은 '발생주의'에 대해 혼자 공부해봤어요/)).toBeVisible()

  // Both exchanges remain visible together in the same dialogue feed.
  await expect(page.getByText('복식부기\n거래를 두 번 기록한다')).toBeVisible()
  await expect(page.getByText('알려주셔서 고마워요!', { exact: false })).toBeVisible()
})

test('reopening the panel (e.g. after a refresh) reloads the persisted conversation from the server', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let messagesRequested = 0
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onListMessages: async (route) => {
      messagesRequested += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 2,
          messages: [
            { id: 1, character_id: 1, speaker: 'user', source: 'user_taught', content: '복식부기\n거래를 두 번 기록한다', verification_status: null, knowledge_entry_id: null, created_at: new Date().toISOString() },
            { id: 2, character_id: 1, speaker: 'character', source: 'user_taught', content: '정확해요! 알려주셔서 고마워요!', verification_status: 'appropriate', knowledge_entry_id: 10, created_at: new Date().toISOString() },
          ],
        }),
      })
    },
  })

  await page.goto('/grow')
  // Never clicked "Gemini 검증하기" in this test — the conversation shown
  // below comes entirely from the server, not from any action taken in
  // this session, proving it was reloaded rather than re-derived locally.
  await page.getByRole('button', { name: '가르치기' }).click()

  // PR #46: GrowthHUD also shows a "최근: ..." preview built from the same
  // listMessages data, so the dialogue text now appears twice on the page —
  // scope these assertions to the sheet's dialogue feed specifically.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('복식부기\n거래를 두 번 기록한다')).toBeVisible()
  await expect(dialog.getByText('정확해요! 알려주셔서 고마워요!', { exact: false })).toBeVisible()
  expect(messagesRequested).toBeGreaterThan(0)
})

// --- PR #63: 6단계 카드형 미션 — 어느 입력 경로(선택지 칩/AI 추천/직접
// 입력)로 채웠는지가 저장 요청의 missionType으로 그대로 실려가는지
// 확인한다. 셋 다 기존 검증/저장 로직 자체는 전혀 건드리지 않았으므로,
// 여기서는 missionType 태깅만 검증한다.

test('filling the form from a topic suggestion chip and saving tags the save request as missionType=objective', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-objective',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveRequestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: 1, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByTestId('topic-suggestion-chip').first().click()
  await page.getByRole('button', { name: 'AI검증하기' }).click()
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => saveRequestBody).toBeTruthy()
  expect(saveRequestBody?.missionType).toBe('objective')
})

test('clicking 스스로 공부하기 and saving tags the save request as missionType=subjective', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '복식부기', content: '거래를 차변과 대변에 기록한다.' },
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-subjective',
          characterReply: "오늘은 '복식부기'를 공부했어요!",
          remaining: 2,
          dailyStudyLimit: 3,
        }),
      })
    },
    onSave: async (route) => {
      saveRequestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: 1, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'ai_generated', created_at: new Date().toISOString() },
          savedReply: '저장했어요!',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => saveRequestBody).toBeTruthy()
  expect(saveRequestBody?.missionType).toBe('subjective')
})

test('typing the title/content directly and saving tags the save request as missionType=knowhow', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-knowhow',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveRequestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: 1, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('나만의 노하우')
  await page.getByTestId('knowledge-content-textarea').fill('현장에서만 배울 수 있는 내용')
  await page.getByRole('button', { name: 'AI검증하기' }).click()
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => saveRequestBody).toBeTruthy()
  expect(saveRequestBody?.missionType).toBe('knowhow')
})

test('the mission progress summary shows the current tier\'s 6-slot progress, by type', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    // 이 테스트만 2/0/1(objective는 이미 완료)로 기본 진행 상태를 덮어쓴다.
    onMissions: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          missionProgress: {
            ageTier: 'toddler',
            ageTierLabel: '8~9살',
            byType: {
              objective: { type: 'objective', confirmed: 2, required: 2, complete: true },
              subjective: { type: 'subjective', confirmed: 0, required: 2, complete: false },
              knowhow: { type: 'knowhow', confirmed: 1, required: 2, complete: false },
            },
            confirmedTotal: 3,
            requiredTotal: 6,
            allConfirmed: false,
            nextAgeTier: 'teen',
            nextAgeTierLabel: '10대',
          },
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByTestId('mission-progress-summary')).toContainText('8~9살 성장 미션 3/6')
  await expect(page.getByTestId('mission-progress-objective')).toContainText('2/2')
  await expect(page.getByTestId('mission-progress-subjective')).toContainText('0/2')
  await expect(page.getByTestId('mission-progress-knowhow')).toContainText('1/2')
})

// PR #65: 지식 카드 10종 분류 — missionType(입력 방식)과는 독립된 선택값
// 칩이 저장 요청의 knowledgeCategory로 그대로 실려가는지 확인한다.
test('picking a knowledge-category chip and saving tags the save request with knowledgeCategory', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-category',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveRequestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: {
            id: 1,
            character_id: 1,
            profession: 'accountant',
            title: 'x',
            original_content: 'y',
            final_content: 'y',
            verification_status: 'appropriate',
            source: 'user_taught',
            knowledge_category: 'job_tip',
            created_at: new Date().toISOString(),
          },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: 10,
          level: 1,
          leveledUp: false,
          focusPercent: 92,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('세금 신고 팁')
  await page.getByTestId('knowledge-content-textarea').fill('마감일 전에 미리 제출하면 수정할 시간이 생긴다.')
  await page.getByRole('button', { name: 'AI검증하기' }).click()
  await page.getByTestId('knowledge-category-chip-job_tip').click()
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => saveRequestBody).toBeTruthy()
  expect(saveRequestBody?.knowledgeCategory).toBe('job_tip')
})

// PR #65('최종 통합 개발 명령서'): 자유 직업("숲해설가")으로도 가르치기·
// 스스로 공부하기가 그대로 동작하고, 패널 헤더에 실제 입력한 직업명이
// 보여야 한다(고정 50개 라벨이 아님).
test('a custom free-text profession ("숲해설가") shows its own label in the teach panel and study-generate still works', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  const NURI_FOREST_GUIDE = {
    id: 1,
    user_id: USER.id,
    companion_type: 'nuri',
    stage: 'child',
    profession: 'custom',
    custom_profession_label: '숲해설가',
    created_at: new Date().toISOString(),
  }
  await mockCharacterApi(page, {
    characters: [NURI_FOREST_GUIDE],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '숲 생태 관찰 팁', content: '아침 시간대에 동물 발자국을 더 쉽게 볼 수 있다.' },
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-forest-study',
          characterReply: '스스로 공부했어요!',
          remaining: 2,
          dailyStudyLimit: 3,
        }),
      })
    },
  })

  await page.goto('/grow')
  await expect(page.getByTestId('profession-badge')).toHaveText('숲해설가')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('누리 · 숲해설가와 상호작용하기')).toBeVisible()

  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('숲 생태 관찰 팁')
})

// 지시서(가르치기 완료 후 자동 식사 이벤트): 8~9살 단계에서 지식 저장이
// 3번 쌓이면 패널이 자동으로 닫히고 "배고프다" → "맛있게 먹었다" 말풍선
// 이벤트가 이어진다. NURI_ACCOUNTANT는 level을 지정하지 않아 기본값으로
// toddler(8~9살) 단계다.
test('completing 3 knowledge saves at the 8~9살 stage auto-closes the teach panel and shows hunger then meal speech bubbles', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-meal',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('지식 제목').fill(`지식 ${i}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${i}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
    if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  }

  // 3번째 저장 직후 패널이 자동으로 닫히고, 캐릭터가 배고프다는 말풍선을 띄운다.
  await expect(page.getByRole('dialog', { name: '가르치기 · 스스로 공부하기' })).toHaveCount(0)
  await expect(page.getByTestId('speech-bubble')).toContainText('배가 고파요')
  // 잠시 뒤 '이모네김밥'을 맛있게 먹었다는 말풍선으로 이어진다.
  await expect(page.getByTestId('speech-bubble')).toContainText('이모네김밥')
})

// 위 테스트와 같은 식사 이벤트지만, Stage 1 온보딩으로 체험판 가상
// 용돈을 먼저 받은 캐릭터라면 김밥값 10,000원이 실제로(체험판 안에서)
// 차감되는지까지 확인한다.
test('the meal event deducts 10,000원 from the mock allowance granted during onboarding', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      const created = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      const updated = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: body.profession,
        custom_profession_label: body.customProfessionLabel ?? null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: updated }) })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-meal-wallet',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'custom', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  await page.getByRole('button', { name: '가르치기' }).click()
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('지식 제목').fill(`지식 ${i}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${i}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
    if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  }

  await expect(page.getByTestId('speech-bubble')).toContainText('이모네김밥')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')
})

// 지시서(누리AI 만능마켓): 온보딩으로 지급된 체험판 가상 용돈으로
// 만능마켓에서 물건을 구입하면 실제로 잔액이 차감되는지 검증한다.
// 이미 배포된 "아이템 마켓"(Gold 경제)과는 완전히 별개의 화면·통화다.
test('buying an item in the universal market (만능마켓) deducts from the mock allowance', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      const created = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      const updated = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: body.profession,
        custom_profession_label: body.customProfessionLabel ?? null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: updated }) })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  await page.getByRole('button', { name: '만능마켓' }).click()
  const dialog = page.getByRole('dialog', { name: '만능마켓' })
  await expect(dialog.getByTestId('universal-market-balance')).toContainText('100,000원')

  await dialog.getByRole('button', { name: '의사 가운 세트' }).click()
  await page.getByRole('button', { name: '구입하기' }).click()

  await expect(dialog.getByTestId('universal-market-balance')).toContainText('75,000원')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('75,000원')
  await expect(dialog.getByText('최근 구입한 물건')).toBeVisible()
})

// 지시서(연령대별 식사 모습 이미지 적용): 식사 이벤트로 pose가
// 'eating'이 되면 기존 🍙 이모지 오버레이 대신 연령대별 전신 식사
// 일러스트가 뜨고, 식사가 끝나 pose가 'idle'로 돌아가면 원래의 평상시
// 전신 일러스트로 되돌아온다.
test('the meal event swaps the illustrated portrait to the age-tier eating image, then back to idle', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      const created = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      const updated = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: body.profession,
        custom_profession_label: body.customProfessionLabel ?? null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: updated }) })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-meal-portrait',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'custom', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()

  const portrait = page.getByTestId('illustrated-age-portrait-nuri')
  await expect(portrait).toHaveAttribute('src', /nuri-toddler/)
  await expect(portrait).not.toHaveAttribute('src', /-eating/)

  await page.getByRole('button', { name: '가르치기' }).click()
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('지식 제목').fill(`지식 ${i}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${i}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
    if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  }

  await expect(page.getByTestId('speech-bubble')).toContainText('이모네김밥')
  await expect(portrait).toHaveAttribute('src', /nuri-toddler-eating/)

  // 2600ms 후 식사가 끝나 pose가 다시 idle로 돌아간다 — 평상시 전신
  // 일러스트로 되돌아왔는지 확인한다.
  await expect(portrait).not.toHaveAttribute('src', /-eating/, { timeout: 4000 })
})

// 지시서(8~9살 기초지식 완료 후 서점 외출 미션): 식사 이벤트와 같은
// "3회 저장" 신호를 공유하며 번갈아 뜬다 — 1번째 3회(round 0)는 식사,
// 2번째 3회(round 1, 누적 6회)는 서점 외출이어야 한다.
test('a second round of 3 saves (6 total) triggers the bookstore outing: +300P, walk there, review card, reward, walk back', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-bookstore',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')

  const teachThreeTimes = async (roundLabel: string) => {
    await page.getByRole('button', { name: '가르치기' }).click()
    for (let i = 0; i < 3; i++) {
      await page.getByPlaceholder('지식 제목').fill(`${roundLabel} ${i}`)
      await page.getByTestId('knowledge-content-textarea').fill(`내용 ${roundLabel} ${i}`)
      await page.getByRole('button', { name: 'AI검증하기' }).click()
      await page.getByRole('button', { name: '저장' }).click()
      if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
    }
  }

  // 1번째 3회 — 식사 이벤트(기존 동작, 여기서는 지나가는 것만 확인).
  await teachThreeTimes('round0')
  await expect(page.getByTestId('speech-bubble')).toContainText('이모네김밥')

  // 2번째 3회(누적 6회) — 서점 외출 이벤트.
  await teachThreeTimes('round1')

  await expect(page.getByRole('dialog', { name: '가르치기 · 스스로 공부하기' })).toHaveCount(0)
  await expect(page.getByTestId('points-popup')).toContainText('+300P')
  await expect(page.getByTestId('bookstore-outing-overlay')).toBeVisible()
  // 지시서(연령대별 걷는 모습 이미지 적용): "걸어가는 중"(2초짜리 단계,
  // 도착 카드로 바뀌기 전) 연출이 더 이상 SVG 도형이 아니라 연령대별
  // 전신 걷는 일러스트를 보여준다 — 도착 카드로 넘어가기 전에 먼저
  // 확인한다.
  await expect(page.getByTestId('bookstore-walk-sprite').locator('img')).toHaveAttribute('src', /nuri-toddler-walking/)
  await expect(page.getByTestId('bookstore-leave-review-button')).toBeVisible()

  await page.getByTestId('bookstore-leave-review-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('인체해부도')
  await expect(page.getByTestId('bookstore-outing-overlay')).toHaveCount(0)
  await expect(page.getByTestId('speech-bubble')).toContainText('다녀왔어요')
})

// 지시서(생활·경제 전략 이벤트 — 알바/돈 벌기): 식사(1번째 3회) → 서점
// 외출(2번째 3회)에 이어, 3번째 3회(누적 9회)는 알바 이벤트가 뜨고
// 체험판 용돈이 늘어나야 한다. 온보딩으로 받은 100,000원에서 식사비
// 10,000원이 빠지고 알바 수입 20,000원이 더해지면 110,000원이다
// (서점 이벤트의 +300P는 용돈이 아닌 별도 체험판 골드라 영향 없음).
test('a third round of 3 saves (9 total) triggers the part-time job event and adds 20,000원 to the mock allowance', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      const created = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ character: created }) })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      const updated = {
        id: 1,
        user_id: USER.id,
        companion_type: body.companionType,
        stage: 'child',
        profession: body.profession,
        custom_profession_label: body.customProfessionLabel ?? null,
        level: 1,
        exp: 0,
        created_at: new Date().toISOString(),
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ character: updated }) })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-job',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'custom', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '누리 만들기 (남)' }).click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  const teachThreeTimes = async (roundLabel: string) => {
    await page.getByRole('button', { name: '가르치기' }).click()
    for (let i = 0; i < 3; i++) {
      await page.getByPlaceholder('지식 제목').fill(`${roundLabel} ${i}`)
      await page.getByTestId('knowledge-content-textarea').fill(`내용 ${roundLabel} ${i}`)
      await page.getByRole('button', { name: 'AI검증하기' }).click()
      await page.getByRole('button', { name: '저장' }).click()
      if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
    }
  }

  await teachThreeTimes('round0') // 식사: -10,000원
  await expect(page.getByTestId('speech-bubble')).toContainText('이모네김밥')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  await teachThreeTimes('round1') // 서점: 용돈이 아니라 체험판 골드 +300P
  await expect(page.getByTestId('bookstore-leave-review-button')).toBeVisible()
  await page.getByTestId('bookstore-leave-review-button').click()
  await expect(page.getByTestId('bookstore-outing-overlay')).toHaveCount(0, { timeout: 5000 })

  await teachThreeTimes('round2') // 알바: +20,000원
  await expect(page.getByTestId('turn-transition')).toContainText('아르바이트하는 중')
  await expect(page.getByTestId('money-popup')).toContainText('20,000원')
  await expect(page.getByTestId('speech-bubble')).toContainText('아르바이트해서')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('110,000원')
})
