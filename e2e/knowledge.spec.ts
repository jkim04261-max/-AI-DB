import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'
import { ageTierForLevel } from '../src/data/characterAge'
import { ALL_PART_TIME_JOB_QUESTIONS } from '../src/data/partTimeJobQuizzes'

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
    // 지시서(학습 플로우 전면 개편) 2단계 "객관식 2문제" 전용 — 지정하지
    // 않으면 고정된 2문제(정답은 둘 다 선택지 0번)를 내려주고, 제출은
    // 항상 둘 다 맞았다고 채점한다(이 단계 자체를 다루지 않는 테스트를
    // 위한 기본값).
    onObjectiveQuiz?: (route: Route) => Promise<void>
    onObjectiveQuizSubmit?: (route: Route) => Promise<void>
    // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합) ②단계 "직업 카드
    // 맞추기" 전용 — 지정하지 않으면 항상 적합 판정 + 고정 토큰을
    // 내려주는 기본값을 쓴다(이 단계 자체를 다루지 않는 테스트를 위한
    // 기본값, 다른 onXxx들과 같은 패턴).
    onCompleteCardGame?: (route: Route) => Promise<void>
    // 지시서(한도 소진 시 구매 유도 UI) 전용 — 지정하지 않으면 소진되지
    // 않은 기본값(10/10, 3/3)을 돌려준다.
    onUsage?: (route: Route) => Promise<void>
    // 지시서(만능마켓 구매 즉시 이용권 실시간 연동) 전용 — 지정하지
    // 않으면 구매할 때마다 1장씩 쌓이는 기본 동작(실제 서버와 같은
    // 모양)을 흉내낸다. 아래 두 모의 변수(aiRecommendTickets/
    // knowledgeValidationTickets)로 호출마다 쌓인 값을 유지한다.
    onPurchaseAiRecommendTicket?: (route: Route) => Promise<void>
    onPurchaseKnowledgeValidationTicket?: (route: Route) => Promise<void>
  },
) {
  // 지시서(만능마켓 구매 즉시 이용권 실시간 연동): 기본 동작은 실제
  // 서버처럼 "구매마다 +1, 응답에 두 수량 모두 포함"을 흉내낸다 —
  // mockCharacterApi가 테스트당 새로 호출되므로 이 클로저도 테스트마다
  // 새로 시작된다.
  let aiRecommendTickets = 0
  let knowledgeValidationTickets = 0

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
    // PR #49: 상단 리소스 바의 "행동력"용 GET ?action=usage 기본값 —
    // 지시서(한도 소진 시 구매 유도 UI) 테스트는 onUsage로 소진 상태를
    // 직접 지정한다.
    if (method === 'GET' && action === 'usage') {
      if (options.onUsage) {
        await options.onUsage(route)
        return
      }
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
              card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
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
    if (method === 'POST' && action === 'complete-card-game') {
      if (options.onCompleteCardGame) {
        await options.onCompleteCardGame(route)
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '직업 카드 맞추기 완료', content: '직업 카드와 도구 카드를 모두 맞춰서 한 세트를 클리어했습니다.' },
          verification: { status: 'appropriate', explanation: '모든 카드를 맞췄어요!', relevance: '', issues: '', suggestion: '' },
          verificationToken: 'mock-card-game-token',
          characterReply: '우와, 카드를 다 맞췄어요! 정말 멋져요!',
        }),
      })
      return
    }
    if (method === 'POST' && action === 'purchase-ai-recommend-ticket') {
      if (options.onPurchaseAiRecommendTicket) {
        await options.onPurchaseAiRecommendTicket(route)
        return
      }
      aiRecommendTickets += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ aiRecommendTickets, knowledgeValidationTickets }),
      })
      return
    }
    if (method === 'POST' && action === 'purchase-knowledge-validation-ticket') {
      if (options.onPurchaseKnowledgeValidationTicket) {
        await options.onPurchaseKnowledgeValidationTicket(route)
        return
      }
      knowledgeValidationTickets += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ aiRecommendTickets, knowledgeValidationTickets }),
      })
      return
    }
    if (method === 'GET' && action === 'objective-quiz') {
      if (options.onObjectiveQuiz) {
        await options.onObjectiveQuiz(route)
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          questions: [
            { id: 'mock-obj-1', text: '객관식 문제 1', choices: ['정답', '오답1', '오답2', '오답3'] },
            { id: 'mock-obj-2', text: '객관식 문제 2', choices: ['정답', '오답1', '오답2', '오답3'] },
          ],
          quizToken: 'mock-objective-quiz-token',
        }),
      })
      return
    }
    if (method === 'POST' && action === 'objective-quiz-submit') {
      if (options.onObjectiveQuizSubmit) {
        await options.onObjectiveQuizSubmit(route)
        return
      }
      const body = route.request().postDataJSON() as { answers?: [number, number] }
      const allCorrect = body.answers?.[0] === 0 && body.answers?.[1] === 0
      await route.fulfill({
        status: allCorrect ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          allCorrect,
          results: [
            { questionId: 'mock-obj-1', correct: body.answers?.[0] === 0 },
            { questionId: 'mock-obj-2', correct: body.answers?.[1] === 0 },
          ],
          message: allCorrect ? '정답이에요! 2문제 모두 맞혔어요.' : '앗, 틀렸어요! 다시 도전해 볼까요?',
          expAwarded: allCorrect ? 20 : 0,
          exp: 10,
          level: 1,
          leveledUp: false,
          missionProgress: null,
          evolved: false,
          newAgeTier: null,
          newAgeTierLabel: null,
        }),
      })
      return
    }
    await route.fallback()
  })
}

// 지시서(10대 전용 알바 시스템): JobEventModal은 걷기 연출이 끝나면
// 자동으로 질문 화면으로 넘어간다(타이머) — 화면에 보이는 질문
// 텍스트로 ALL_PART_TIME_JOB_QUESTIONS에서 정답 보기를 찾아
// allCorrect가 true면 3문제 모두, false면 첫 문제만 일부러 틀리게
// 고른다("1문제라도 틀리면 0원" 규칙 검증용).
async function answerJobEventQuiz(page: Page, allCorrect: boolean) {
  await expect(page.getByTestId('job-event-question')).toBeVisible()
  for (let i = 0; i < 3; i++) {
    const questionText = (await page.getByTestId('job-event-question').textContent())?.trim()
    const matched = ALL_PART_TIME_JOB_QUESTIONS.find((q) => q.question === questionText)
    if (!matched) throw new Error(`Unknown job-event question: ${questionText}`)
    const answerCorrectly = allCorrect || i !== 0
    const indexToClick = answerCorrectly ? matched.correctIndex : (matched.correctIndex + 1) % matched.choices.length
    await page.getByTestId('job-event-choice').nth(indexToClick).click()
    await page.getByTestId('job-event-next-button').click()
  }
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

// PR #52 후속 요청 1번(5차에서 2~3살→8~9살로 상향): 가르치기 폼에 쉬운
// 예시 주제가 떠서, 너무 어려운 지식만 쓰다가 거절당해 진도가 막히지
// 않도록 자연스럽게 유도한다. teen(10대) 단계는 자유 선택 3카드 UI를
// 그대로 쓰므로 여기서 확인한다 — toddler(8~9살) 1단계(direct)의
// 동일 기능은 아래 "선택예시하기(3개)" 테스트에서 별도로 확인한다.
test('the teach form suggests age-appropriate example topics for a teen-stage character, and clicking one fills the form', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_ACCOUNTANT, level: 5 }] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('10대 단계에 맞는 예시예요', { exact: false })).toBeVisible()
  await page.getByTestId('topic-suggestion-chip').filter({ hasText: '기본 용어 정리' }).click()

  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('기본 용어 정리')
  await expect(page.getByTestId('knowledge-content-textarea')).not.toHaveValue('')
})

// 지시서(선택예시하기(3개) 버튼 복구): 학습 플로우 전면 개편(PR #108)이
// toddler(8~9살) 전체 구간에서 이 예시 칩을 숨겼는데, 1단계(direct, 아직
// knowhow 3문제를 다 못 채운 상태)에서 "문제 예시를 볼 수 없다"는 사용자
// 불편으로 이어져 다시 노출하기로 했다 — 기본 캐릭터(NURI_ACCOUNTANT,
// level 지정 없음)가 바로 toddler/direct 상태다.
test('the teach form suggests 3 example topics at the toddler (8~9살) direct-input stage, and clicking one fills the form', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_ACCOUNTANT] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('8~9살 단계에 맞는 예시예요', { exact: false })).toBeVisible()
  const chips = page.getByTestId('topic-suggestion-chip')
  await expect(chips).toHaveCount(3)
  await chips.filter({ hasText: '이 직업이 하는 일' }).click()

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

// 지시서(학습 플로우 전면 개편) 이후 toddler(8~9살)는 1~3단계 강제
// 순서 흐름을 쓰고(2단계는 새 객관식 퀴즈, 3단계는 전용 주관식 입력),
// "AI 추천 받기"(스스로 공부하기) 카드는 더 이상 보이지 않는다.
// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합) 이후 teen(10대)도 고정
// 10단계 커리큘럼으로 바뀌어 이 카드가 더 이상 없으므로, junior_20s
// (20대, 이번 지시서 범위 밖이라 기존 자유 선택 UI를 그대로 쓴다)로
// 올려서 이 기존 기능이 그대로 동작하는지 확인한다.
test('clicking 스스로 공부하기 shows N candidate cards; picking one fills the generated knowledge, shows a character dialogue line, and can be saved', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCalled = false
  await mockCharacterApi(page, {
    // level:10 → junior_20s(이번 지시서 범위 밖, 기존 자유 선택 UI를
    // 그대로 씀). 여기 쓰는 7은 이 모킹된 응답 자체가 정하는 임의의
    // 예시 개수일 뿐 — 실제 selfStudyDraftCountForTier('junior_20s')
    // 값과 무관하게 이 테스트는 "여러 후보 중 하나를 고르는 UI"가
    // 정상 동작하는지만 확인한다(정확한 연령대별 개수 자체는
    // "AI 추천 받기 카드가 동적 N개를 보여준다" 테스트가 검증한다).
    characters: [{ ...NURI_ACCOUNTANT, level: 10 }],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: Array.from({ length: 7 }, (_, i) => ({
            knowledge: { title: i === 0 ? '복식부기' : `후보 ${i}`, content: i === 0 ? '거래를 차변과 대변에 동시에 기록한다.' : `내용 ${i}` },
            verification: { status: 'appropriate', explanation: '정확해요', relevance: '회계사와 관련 있어요', issues: '', suggestion: '' },
            verificationToken: i === 0 ? 'mock-token-study' : `mock-token-study-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 7개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 7,
          characterAgeTier: 'junior_20s',
          focusPercent: 90,
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

  // 지시서(AI 추천(예시 만들기) 개수에 대한 명확한 지시): 클릭 1번이
  // 예시 1개가 아니라 이 캐릭터의 연령대(junior_20s)에 맞는 7개 후보
  // 카드를 한 번에 보여준다 — 그중 하나를 골라야 기존처럼 입력칸이
  // 채워진다(자동 완료 금지는 여전히 유지).
  await expect(page.getByText('예시 7개를 만들었어요! 마음에 드는 걸 골라보세요.', { exact: false })).toBeVisible()
  const cards = page.getByTestId('study-draft-card')
  await expect(cards).toHaveCount(7)
  await cards.filter({ hasText: '복식부기' }).click()

  // The composer is filled with what the character generated, so the user
  // can review it before saving — self-study never auto-saves either.
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('복식부기')
  await expect(page.getByTestId('knowledge-content-textarea')).toHaveValue('거래를 차변과 대변에 동시에 기록한다.')
  await expect(page.getByText('남은 횟수: 무료 2회 / 구매 0회')).toBeVisible()

  const saveButton = page.getByRole('button', { name: '저장' })
  await expect(saveButton).toBeEnabled()
  expect(saveCalled).toBe(false)

  await saveButton.click()
  await expect(page.getByText('이 지식을 학습 기록에 저장했어요!', { exact: false })).toBeVisible()
  expect(saveCalled).toBe(true)
})

// 지시서(학습 플로우 전면 개편) 이후 toddler(8~9살)는 강제 순서 흐름을
// 쓰므로, 같은 패널 안에서 "AI 추천 받기"를 자유롭게 섞어 쓰는 이 기존
// 동작은(지시서(10대 커리큘럼: 직업 카드 맞추기 통합) 이후 teen도
// 고정 순서 흐름을 쓰므로) junior_20s(20대) 단계로 올려서 확인한다.
test('teaching and self-study both happen in the same panel, building one shared dialogue feed (not separate modes)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [{ ...NURI_ACCOUNTANT, level: 10 }],
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
          drafts: Array.from({ length: 7 }, (_, i) => ({
            knowledge: { title: i === 0 ? '발생주의' : `후보 ${i}`, content: i === 0 ? '수익과 비용은 발생한 시점에 인식한다.' : `내용 ${i}` },
            verification: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' },
            verificationToken: i === 0 ? 'mock-token-study-2' : `mock-token-study-2-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 7개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 7,
          characterAgeTier: 'junior_20s',
          focusPercent: 90,
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
  // switch, no separate screen. 생성 직후 캐릭터 발화가 먼저 피드에
  // 추가되고, 7개 후보 중 하나를 고르면 그대로 기존 입력/저장 흐름이
  // 이어진다.
  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await expect(page.getByText('예시 7개를 만들었어요! 마음에 드는 걸 골라보세요.', { exact: false })).toBeVisible()
  await page.getByTestId('study-draft-card').filter({ hasText: '발생주의' }).click()
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('발생주의')

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
// 여기서는 missionType 태깅만 검증한다. 지시서(학습 플로우 전면 개편)
// 이후 toddler(8~9살)는 강제 순서 흐름을 쓰므로(AI 추천 카드가 안
// 보임), "AI 추천 받기"는 junior_20s(20대, 지시서(10대 커리큘럼: 직업
// 카드 맞추기 통합) 이후 teen도 고정 순서 흐름을 써서 이 카드가
// 없어졌으므로) 단계로 올려서 확인한다 — knowhow(직접 입력)는
// toddler 1단계에서 이미 그대로 검증된다(아래 "typing the
// title/content directly" 테스트). 선택지 칩은 junior_20s에서는
// objective로, toddler 1단계에서는 knowhow로 태깅되므로(아래 두
// 테스트) 둘 다 확인한다.

test('filling the form from a topic suggestion chip and saving tags the save request as missionType=objective', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [{ ...NURI_ACCOUNTANT, level: 10 }],
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

// 지시서(선택예시하기(3개) 버튼 복구): toddler(8~9살) 1단계(direct)에서는
// 이 예시 칩이 ①번 카드(선택지 고르기)가 아니라 ③번 카드(직접 입력)
// 자리에 뜨므로, 저장 요청은 objective가 아니라 knowhow로 태깅돼야
// 한다 — 그래야 1단계가 기다리는 knowhow 미션 진행도가 올라간다.
test('filling the form from a topic suggestion chip at the toddler direct-input stage tags the save request as missionType=knowhow', async ({ page }) => {
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
          verificationToken: 'tok-toddler-chip',
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
  expect(saveRequestBody?.missionType).toBe('knowhow')
})

// 지시서(8세 학습 창 AI 추천 버튼 복구): 학습 플로우 전면 개편(PR #108)
// 때 toddler(8~9살) 전체 구간에서 "AI 추천 받기" 카드가 사라졌는데,
// 실제로는 1단계(direct, 직접 입력 카드와 같은 자리)에서는 다시
// 보여야 한다는 요청 — 선택예시하기(3개) 버튼을 되돌린 것과 같은
// 범위(showDirectInputCards)다. 버튼 클릭 → 저장까지 missionType이
// 여전히 subjective로 태깅되어 toddler의 subjective(1개) 미션
// 진행도가 올라가는지 함께 확인한다.
test('the AI 추천 받기 card is visible again at the toddler (8~9살) direct-input stage, and saving it still tags missionType=subjective', async ({ page }) => {
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
          drafts: Array.from({ length: 3 }, (_, i) => ({
            knowledge: { title: i === 0 ? '복식부기' : `후보 ${i}`, content: i === 0 ? '거래를 차변과 대변에 기록한다.' : `내용 ${i}` },
            verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
            verificationToken: i === 0 ? 'tok-toddler-study' : `tok-toddler-study-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 3개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 3,
          characterAgeTier: 'toddler',
          focusPercent: 90,
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

  await expect(page.getByText('✨ AI 추천 받기', { exact: true })).toBeVisible()
  const studyButton = page.getByRole('button', { name: '✨ 예시 만들어주기' })
  await expect(studyButton).toBeVisible()
  await studyButton.click()
  await page.getByTestId('study-draft-card').filter({ hasText: '복식부기' }).click()
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => saveRequestBody).toBeTruthy()
  expect(saveRequestBody?.missionType).toBe('subjective')
})

// 위 복구가 toddler의 2단계(객관식)·3단계(전용 주관식 컴포넌트)까지
// 건드리지 않았는지 — 지시서의 "다른 학습 단계를 건드리지 마세요"
// 금지 사항을 직접 확인한다.
test('the AI 추천 받기 card stays hidden during the toddler 2단계(객관식)/3단계(주관식) steps', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onMissions: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          missionProgress: {
            ageTier: 'toddler',
            ageTierLabel: '8~9살',
            byType: {
              objective: { type: 'objective', confirmed: 0, required: 2, complete: false },
              subjective: { type: 'subjective', confirmed: 0, required: 1, complete: false },
              knowhow: { type: 'knowhow', confirmed: 3, required: 3, complete: true },
              card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
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

  // knowhow가 이미 3/3이라 2단계(객관식)로 들어와 있다 — 여기서는
  // AI 추천 받기 카드가 보이면 안 된다.
  await expect(page.getByTestId('objective-quiz-step')).toBeVisible()
  await expect(page.getByText('✨ AI 추천 받기', { exact: true })).toHaveCount(0)
})

// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합) 이후 teen도 고정 순서
// 흐름을 써서 "AI 추천 받기" 카드가 없으므로, junior_20s(20대)로
// 올려서 확인한다.
test('clicking 스스로 공부하기 and saving tags the save request as missionType=subjective', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveRequestBody: Record<string, unknown> | null = null
  await mockCharacterApi(page, {
    characters: [{ ...NURI_ACCOUNTANT, level: 10 }],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: Array.from({ length: 7 }, (_, i) => ({
            knowledge: { title: i === 0 ? '복식부기' : `후보 ${i}`, content: i === 0 ? '거래를 차변과 대변에 기록한다.' : `내용 ${i}` },
            verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
            verificationToken: i === 0 ? 'tok-subjective' : `tok-subjective-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 7개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 7,
          characterAgeTier: 'junior_20s',
          focusPercent: 90,
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
  await page.getByTestId('study-draft-card').filter({ hasText: '복식부기' }).click()
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
              card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
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

  await expect(page.getByTestId('mission-progress-summary')).toContainText('8~9살 성장 미션 (3/6)')
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
  // 지시서(학습 플로우 전면 개편) 이후 toddler(8~9살)는 강제 순서
  // 흐름을 쓰므로(AI 추천 받기 카드가 안 보임), 이 테스트는
  // junior_20s(20대, 지시서(10대 커리큘럼: 직업 카드 맞추기 통합)
  // 이후 teen도 고정 순서 흐름을 써서 이 카드가 없어졌으므로)로
  // 올려서 "AI 추천 받기"가 자유 직업명으로도 그대로 동작하는지
  // 확인한다.
  const NURI_FOREST_GUIDE = {
    id: 1,
    user_id: USER.id,
    companion_type: 'nuri',
    stage: 'child',
    profession: 'custom',
    custom_profession_label: '숲해설가',
    level: 10,
    created_at: new Date().toISOString(),
  }
  await mockCharacterApi(page, {
    characters: [NURI_FOREST_GUIDE],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: Array.from({ length: 7 }, (_, i) => ({
            knowledge: { title: i === 0 ? '숲 생태 관찰 팁' : `후보 ${i}`, content: i === 0 ? '아침 시간대에 동물 발자국을 더 쉽게 볼 수 있다.' : `내용 ${i}` },
            verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
            verificationToken: i === 0 ? 'tok-forest-study' : `tok-forest-study-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 7개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 7,
          characterAgeTier: 'junior_20s',
          focusPercent: 90,
        }),
      })
    },
  })

  await page.goto('/grow')
  await expect(page.getByTestId('profession-badge')).toHaveText('숲해설가')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByText('누리 · 숲해설가와 상호작용하기')).toBeVisible()

  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await page.getByTestId('study-draft-card').filter({ hasText: '숲 생태 관찰 팁' }).click()
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('숲 생태 관찰 팁')
})

// 지시서(가르치기 완료 후 자동 식사 이벤트): 8~9살 단계에서 지식 저장이
// 3번 쌓이면 패널이 자동으로 닫히고 "배고프다" → "맛있게 먹었다" 말풍선
// 이벤트가 이어진다. NURI_ACCOUNTANT는 level을 지정하지 않아 기본값으로
// toddler(8~9살) 단계다.
// 지시서(배고픔 이벤트 UI/UX 및 경제 시스템 연동): 3번째 저장 뒤 더 이상
// 자동으로 식사비를 차감·연출하지 않는다 — "밥 먹이기"/"나중에 먹기"를
// 고르는 모달이 뜬다. 이 캐릭터는 Stage 1 온보딩을 거치지 않아
// (wallet.balanceWon === null) "밥 먹이기"를 눌러도 차감 없이 바로
// 먹는다.
test('completing 3 knowledge saves at the 8~9살 stage auto-closes the teach panel and shows the hungry event modal', async ({ page }) => {
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

  // 3번째 저장 직후 패널이 자동으로 닫히고, 배고픔 이벤트 모달이 뜬다.
  await expect(page.getByRole('dialog', { name: '가르치기 · 스스로 공부하기' })).toHaveCount(0)
  await expect(page.getByTestId('hungry-event-modal')).toContainText('배고파해요. 밥 먹으러 갑니다!')

  // 체험판 용돈을 아직 지급받지 않은 캐릭터라, "밥 먹이기"를 눌러도
  // 금액 표기 없이 바로 먹는다.
  await expect(page.getByTestId('hungry-event-feed-button')).toHaveText('밥 먹이기')
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-modal')).toHaveCount(0)
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠! 잘 먹었습니다!')
})

// 지시서(밥 먹는 캐릭터 에셋 깨짐 방지): 식사 그림(eating) 로드가
// 실패하는 상황(네트워크 오류, 캐시 문제 등)을 인위적으로 재현해도,
// 깨진 이미지 아이콘이 아니라 평상시 전신 그림으로 조용히 대체되는지
// 확인한다.
test('a failed-to-load eating image falls back to the idle portrait instead of a broken image icon', async ({ page }) => {
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
          verificationToken: 'tok-meal-broken-asset',
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

  // "걷는 중"/"식사" 전신 그림(walking/eating) 요청을 전부 실패시켜
  // 깨짐 상황을 재현한다.
  await page.route('**/*walking*.webp', (route) => route.abort())
  await page.route('**/*eating*.webp', (route) => route.abort())

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('지식 제목').fill(`지식 ${i}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${i}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
    if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  }

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  // 모달이 뜨자마자 보이는 "걷는 중" 그림이 깨진 경로 대신 평상시
  // 전신 그림(idle)으로 대체됐는지 확인한다 — src에 "-walking"이
  // 없어야 한다.
  await expect(page.getByTestId('hungry-event-modal').locator('img')).toHaveAttribute('src', /nuri-toddler(?!-walking)/)

  // "밥 먹이기"를 누르면 "식사" 그림으로 바뀌는데, 이 역시 같은 이유로
  // 평상시 전신 그림으로 대체돼야 한다 — src에 "-eating"도 없어야 한다.
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-modal').locator('img')).toHaveAttribute('src', /nuri-toddler(?!-eating)/)
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
  await page.getByTestId('character-create-nuri').click()
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

  await expect(page.getByTestId('hungry-event-modal')).toContainText('배고파해요. 밥 먹으러 갑니다!')
  await expect(page.getByTestId('hungry-event-feed-button')).toHaveText('밥 먹이기 (-10,000원)')
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-modal')).toHaveCount(0)
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠! 잘 먹었습니다!')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')
})

// 지시서(배고픔 이벤트 UI/UX 및 경제 시스템 연동): 잔액이 식사비보다
// 적으면 "밥 먹이기"를 눌러도 차감되지 않고 안내만 뜬다 — 모달은
// 열린 채로 남는다.
test('insufficient balance blocks feeding and shows an inline warning, without closing the modal', async ({
  page,
}) => {
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
          verificationToken: 'tok-meal-poor',
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
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  // 만능마켓에서 미리 써서 잔액을 식사비(10,000원) 미만으로 만든다
  // (100,000원 - 업무용 노트북 50,000원 - 미니 냉장고 45,000원 = 5,000원).
  await page.getByRole('button', { name: '만능마켓' }).click()
  await page.getByRole('button', { name: '업무·사무관' }).click()
  await page.getByText('업무용 노트북').click()
  await page.getByRole('button', { name: '구입하기' }).click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('50,000원')
  await page.getByRole('button', { name: '생활·가전관' }).click()
  await page.getByText('미니 냉장고').click()
  await page.getByRole('button', { name: '구입하기' }).click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('5,000원')
  await page.getByRole('button', { name: '닫기' }).click()

  await page.getByRole('button', { name: '가르치기' }).click()
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('지식 제목').fill(`지식 ${i}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${i}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
    if (i < 2) await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  }

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-error')).toContainText(
    '잔액이 부족하여 밥을 사줄 수 없어요. 문제를 더 풀어주세요!',
  )
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('5,000원')
})

// 지시서(배고픔 이벤트 시 2.5D 동네 배경 걷기 애니메이션 구현): "밥
// 먹이기"를 누르면 음식 아이콘 연출이 잠깐 나타난 뒤에야 모달이
// 닫히는지 확인한다(즉시 닫히지 않는다).
test('feeding plays a brief food-icon animation before the modal closes', async ({ page }) => {
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
          verificationToken: 'tok-meal-anim',
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

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-food-icon')).toBeVisible()
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await expect(page.getByTestId('hungry-event-modal')).toHaveCount(0)
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠! 잘 먹었습니다!')
  await expect(page.getByTestId('hungry-warning-banner')).toHaveCount(0)
})

// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): 평소에는 동네 전경이 보이고, "밥 먹이기"를 누르면(식당에
// 들어가면) 식당 내부 배경이 페이드인(opacity-100)되는지 확인한다.
test('the hungry event fades the background from the town square to the restaurant interior when feeding starts', async ({
  page,
}) => {
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
          verificationToken: 'tok-meal-bg',
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

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await expect(page.getByTestId('hungry-event-town-bg')).toBeVisible()
  await expect(page.getByTestId('hungry-event-restaurant-bg')).toHaveClass(/opacity-0\b/)

  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('hungry-event-restaurant-bg')).toHaveClass(/opacity-100/)
})

// 지시서(배고픔 이벤트 UI/UX 및 경제 시스템 연동): "나중에 먹기"를
// 누르면 연출 없이 곧바로 모달이 닫히고, isHungry 경고 배너가 뜬 채로
// 유지되는지 확인한다(퀴즈 3회를 풀기 전까지) — 지금까지는 이
// 분기에 대한 e2e 커버리지가 없었다.
test('"나중에 먹기" closes the modal immediately and keeps the hungry warning banner', async ({ page }) => {
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
          verificationToken: 'tok-meal-later',
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

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-later-button').click()
  await expect(page.getByTestId('hungry-event-modal')).toHaveCount(0)
  await expect(page.getByTestId('hungry-warning-banner')).toContainText('배고파요... 밥 사주세요!')
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
  await page.getByTestId('character-create-nuri').click()
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

// 지시서(서점 팝업 흐름 수정): 자동으로 뜨던 서점 외출 팝업을 없애고,
// "직업 관련 서적 구매"를 만능마켓의 직업관 카테고리에서 사용자가
// 직접 고를 수 있게 옮겼다 — 다른 만능마켓 아이템과 똑같이 구매가
// 되는지 확인한다.
test('buying 직업 전문 서적 in the universal market (만능마켓) works like any other career-category item', async ({ page }) => {
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
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  await page.getByRole('button', { name: '만능마켓' }).click()
  const dialog = page.getByRole('dialog', { name: '만능마켓' })
  await expect(dialog.getByTestId('universal-market-balance')).toContainText('100,000원')

  await dialog.getByRole('button', { name: '직업 전문 서적' }).click()
  await page.getByRole('button', { name: '구입하기' }).click()

  await expect(dialog.getByTestId('universal-market-balance')).toContainText('82,000원')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('82,000원')
  await expect(dialog.getByText('최근 구입한 물건')).toBeVisible()
})

// 지시서(한도 소진 시 구매 유도 UI): "예시 만들어주기"(studyRemaining)가
// 0이 되면 버튼이 비활성화되고 그 옆에 구매 버튼이 뜬다 —
// junior_20s(20대) 단계로 올려서 확인한다(toddler는 이 카드 자체가
// 안 보이고, 지시서(10대 커리큘럼: 직업 카드 맞추기 통합) 이후
// teen도 고정 순서 흐름을 써서 이 카드가 없어졌으므로 같은 이유로
// 제외한다). 구매 버튼을 누르면 만능마켓이 학습·교육관 탭으로 바로
// 열리는지도 함께 확인한다(실제 구매는 지갑이 필요해 아래 지식 검증
// 테스트에서 온보딩과 함께 확인한다).
test('when the daily AI 추천(study) limit is exhausted, 예시 만들어주기 is disabled and a market buy button appears, routing to the 학습·교육관 tab', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [{ ...NURI_ACCOUNTANT, level: 10 }],
    onUsage: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 0, studyLimit: 3 }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByRole('button', { name: '✨ 예시 만들어주기' })).toBeDisabled()
  const buyRecommendButton = page.getByTestId('buy-recommend-uses-button')
  await expect(buyRecommendButton).toBeVisible()
  await expect(buyRecommendButton).toHaveText(/만능마켓에서 AI 추천 구매하기/)

  await buyRecommendButton.click()
  const market = page.getByRole('dialog', { name: '만능마켓' })
  await expect(market).toBeVisible()
  // initialCategory='education'으로 바로 열렸다면 탭을 누르지 않고도
  // 학습·교육관 아이템이 보여야 한다.
  await expect(market.getByRole('button', { name: 'AI 추천 충전권' })).toBeVisible()
})

// 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가 로직으로 수정):
// "✨ AI 추천 받기" 카드의 안내 문구("OO 단계에서는 한 번에 예시 N개를
// 만들어줘요")가 연령대마다 다른 숫자를 보여주고, 그 숫자가 연령대가
// 올라갈수록 정확히 1개씩 늘어나는지 확인한다 — 이 문구는 순수
// 프런트 계산값(character.ageTier/level, data/characterAge.ts의
// selfStudyDraftCountForTier)이라 아직 버튼을 누르기 전에도 몇 개가
// 나올지 미리 보여준다.
test('the AI 추천 받기 card shows a dynamic "한 번에 N개" count that increases by 1 per age tier (20대=4, 30대=5)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_ACCOUNTANT, level: 10 }] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('ai-recommend-tier-count')).toHaveText('20대 단계에서는 한 번에 예시 4개를 만들어줘요.')
  await page.getByRole('button', { name: '닫기' }).click()

  await mockCharacterApi(page, { characters: [{ ...NURI_ACCOUNTANT, level: 20 }] })
  await page.reload()
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('ai-recommend-tier-count')).toHaveText('30대 단계에서는 한 번에 예시 5개를 만들어줘요.')
})

// 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가 로직으로 수정)
// 완료조건: 8세 계정에서 예시가 1개만 나오는지, 그리고 "선택지를
// 고르세요"가 아니라 "이 예시를 사용해 볼까요?"처럼 더 쉬운 문구로
// 자동 입력을 유도하는지 직접 확인한다. 카드 자체는 여전히 눌러서
// 고르는 방식 그대로다(완전 자동 채움은 아님 — 기존처럼 사용자가
// 검증 결과를 보고 "저장"을 눌러야 미션이 완료된다).
test('a toddler (8~9살) account gets exactly 1 example, shown with "이 예시를 사용해 볼까요?" instead of a multi-pick prompt', async ({
  page,
}) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: [
            {
              knowledge: { title: '복식부기', content: '거래를 차변과 대변에 동시에 기록한다.' },
              verification: { status: 'appropriate', explanation: '정확해요', relevance: '관련 있어요', issues: '', suggestion: '' },
              verificationToken: 'tok-toddler-single',
              ageBlocked: false,
              requiredAgeTier: 'toddler',
            },
          ],
          characterReply: '예시 1개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 1,
          characterAgeTier: 'toddler',
          focusPercent: 90,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('ai-recommend-tier-count')).toHaveText('8~9살 단계에서는 한 번에 예시 1개를 만들어줘요.')

  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await expect(page.getByTestId('study-draft-picker').getByText('이 예시를 사용해 볼까요?')).toBeVisible()
  await expect(page.getByTestId('study-draft-picker').getByText('예시 1개 중 하나를 골라보세요')).toHaveCount(0)
  const cards = page.getByTestId('study-draft-card')
  await expect(cards).toHaveCount(1)

  await cards.click()
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('복식부기')
})

// 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가 로직으로 수정)
// 완료조건 "4. 60대(8개)일 때는 2열 그리드로 배치": 예시 카드가 7개
// 이상이면 2열 그리드로 바뀌는지 확인한다(junior_20s 이하의 적은
// 개수에서는 그대로 1열이어야 한다는 것도 함께 — 위 toddler(1개)
// 테스트가 이미 그 끝을 확인했다).
test('60대(8 examples) renders the study-draft cards in a 2-column grid to avoid a long scroll', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    // master_50s + level:65 → ageNumberForTier('master_50s', 65) === 65
    // (>=60) → selfStudyDraftCountForTier('master_50s', 65) === 8.
    characters: [{ ...NURI_ACCOUNTANT, level: 65 }],
    onStudyGenerate: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: Array.from({ length: 8 }, (_, i) => ({
            knowledge: { title: `후보 ${i}`, content: `내용 ${i}` },
            verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
            verificationToken: `tok-60s-${i}`,
            ageBlocked: false,
            requiredAgeTier: 'toddler',
          })),
          characterReply: '예시 8개를 만들었어요! 마음에 드는 걸 골라보세요. ✨',
          remaining: 2,
          dailyStudyLimit: 3,
          exampleCount: 8,
          characterAgeTier: 'master_50s',
          focusPercent: 90,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('ai-recommend-tier-count')).toHaveText('50~60대 단계에서는 한 번에 예시 8개를 만들어줘요.')

  await page.getByRole('button', { name: '✨ 예시 만들어주기' }).click()
  await expect(page.locator('[data-testid="study-draft-cards"] button')).toHaveCount(8)
  await expect(page.getByTestId('study-draft-cards')).toHaveClass(/sm:grid-cols-2/)
})

// 지시서(만능마켓 구매 즉시 이용권 실시간 연동): "AI검증하기"
// (teachRemaining)가 0이 되면 검증 영역 하단에 구매 버튼이 뜬다. 지갑이
// 있어야 실제 구매를 확인할 수 있으므로(onboarding 전 캐릭터는 지갑이
// 없음), 새 캐릭터를 만드는 흐름으로 진행한다 — toddler(8~9살) 1단계라
// "직접 입력하기" 카드가 그대로 보인다. 구매하면 이제 실제로 하루
// 한도를 한 번 더 늘려주므로(계정 단위 이용권, 서버 영속), 구매 직후
// 버튼이 다시 활성화되고 실제로 클릭해 검증을 끝까지 통과할 수 있어야
// 한다 — 그리고 그 이용권은 소비되어 0으로 돌아간다.
test('when the daily 지식 검증(teach) limit is exhausted, buying 지식 검증 충전권 immediately re-enables AI검증하기 and the ticket is consumed on use', async ({
  page,
}) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [],
    onUsage: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teachRemaining: 0, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }),
      })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-ticket-used',
          characterReply: '알려주셔서 고마워요!',
          remaining: 0,
          dailyTeachLimit: 10,
          // 무료 한도가 0이라 이용권 1장을 써서 통과했다 — 응답에 소비
          // 후 남은 수량(0)이 함께 내려온다(지시서 1번: 실시간 동기화).
          knowledgeValidationTickets: 0,
        }),
      })
    },
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
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  await page.getByRole('button', { name: '가르치기' }).click()
  await page.getByPlaceholder('지식 제목').fill('아무 제목')
  await page.getByTestId('knowledge-content-textarea').fill('아무 내용')
  await expect(page.getByRole('button', { name: 'AI검증하기' })).toBeDisabled()

  const buyValidationButton = page.getByTestId('buy-validation-uses-button')
  await expect(buyValidationButton).toBeVisible()
  await expect(buyValidationButton).toHaveText(/만능마켓에서 지식 검증 횟수 구매하기/)
  await buyValidationButton.click()

  const market = page.getByRole('dialog', { name: '만능마켓' })
  await expect(market.getByTestId('universal-market-balance')).toContainText('100,000원')
  await market.getByRole('button', { name: '지식 검증 충전권' }).click()
  await page.getByRole('button', { name: '구입하기' }).click()
  await expect(market.getByTestId('universal-market-balance')).toContainText('90,000원')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '가르치기' }).click()

  // 구매 직후, 새로고침·재조회 없이 바로 "남은 횟수: 무료 0회 / 구매
  // 1회"로 보이고, 구매 유도 버튼도 사라진다.
  await expect(page.getByTestId('validation-remaining')).toContainText('남은 횟수: 무료 0회 / 구매 1회')
  await expect(page.getByTestId('buy-validation-uses-button')).toHaveCount(0)

  // (버튼은 제목/내용을 채우기 전까지는 그 이유로 비활성 상태다 — 채우고
  // 나면 이용권이 있으니 AI검증하기가 눌릴 수 있어야 한다.)
  await page.getByPlaceholder('지식 제목').fill('아무 제목')
  await page.getByTestId('knowledge-content-textarea').fill('아무 내용')
  await expect(page.getByRole('button', { name: 'AI검증하기' })).toBeEnabled()
  await page.getByRole('button', { name: 'AI검증하기' }).click()
  await expect(page.getByText('적합', { exact: true })).toBeVisible()

  // 이용권 1장을 써서 통과했으므로, 그 즉시 "구매 0회"로 줄어들고
  // 버튼은 다시 막히며 구매 유도 버튼이 재등장한다.
  await expect(page.getByTestId('validation-remaining')).toContainText('남은 횟수: 무료 0회 / 구매 0회')
  await expect(page.getByTestId('buy-validation-uses-button')).toBeVisible()
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
  await page.getByTestId('character-create-nuri').click()
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

  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')
  await expect(portrait).toHaveAttribute('src', /nuri-toddler-eating/)

  // 2600ms 후 식사가 끝나 pose가 다시 idle로 돌아간다 — 평상시 전신
  // 일러스트로 되돌아왔는지 확인한다.
  await expect(portrait).not.toHaveAttribute('src', /-eating/, { timeout: 4000 })
})

// 지시서(서점 팝업 흐름 수정): 자동으로 뜨던 서점 외출 팝업을 완전히
// 제거했다 — 10대 레벨업 트랜지션 직후에 끼어드는 것이 기획과 맞지
// 않다는 지적에 따라, "직업 관련 서적 구매"는 사용자가 필요할 때
// 만능마켓에서 직접 고르도록 옮겼다(universalMarketCatalog.ts의
// '직업 전문 서적' 아이템 참고). 이제 식사·알바 두 이벤트만 "3회
// 저장" 신호를 공유하며 번갈아 뜬다(1번째 3회=식사, 2번째 3회=알바).
// 온보딩으로 받은 100,000원에서 식사비 10,000원이 빠지고 알바 수입
// 20,000원이 더해지면 110,000원이다.
test('a second round of 3 saves (6 total) triggers the part-time job event and adds 20,000원 to the mock allowance', async ({ page }) => {
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
  await page.getByTestId('character-create-nuri').click()
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

  await teachThreeTimes('round0') // 배고픔 이벤트: 밥 먹이기 -10,000원
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  // 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트) 이후
  // toddler(8~9살)는 "알바" 자리에서 자동 연출 대신 선택형 심부름
  // 이벤트가 뜬다 — "심부름 하러 가기"를 고르면 +10,000원.
  await teachThreeTimes('round1') // 심부름: +10,000원
  await expect(page.getByTestId('errand-event-modal')).toBeVisible()
  await page.getByTestId('errand-event-accept-button').click()
  await expect(page.getByTestId('money-popup')).toContainText('10,000원')
  await expect(page.getByTestId('speech-bubble')).toContainText('심부름 완료')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')
})

// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): 심부름을 수락하면(가게로 걸어 들어가면) 가게 내부
// 배경이 페이드인(opacity-100)되는지 확인한다.
test('accepting the errand event fades the background from the town square to the store interior', async ({ page }) => {
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
          verificationToken: 'tok-errand-bg',
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
  await page.getByTestId('character-create-nuri').click()
  await page.getByTestId('opening-profile-profession-input').fill('숲해설가')
  await page.getByTestId('opening-profile-start-button').click()

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

  await teachThreeTimes('round0') // 배고픔 이벤트부터 먼저 뜬다 — 지나가야 심부름까지 간다.
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()

  await teachThreeTimes('round1')
  await expect(page.getByTestId('errand-event-modal')).toBeVisible()
  await expect(page.getByTestId('errand-event-town-bg')).toBeVisible()
  await expect(page.getByTestId('errand-event-store-bg')).toHaveClass(/opacity-0\b/)

  await page.getByTestId('errand-event-accept-button').click()
  await expect(page.getByTestId('errand-event-store-bg')).toHaveClass(/opacity-100/)
})

// 지시서(8세 엄마 심부름 이벤트 구현 및 중복 보상 방지) "거절하기"
// 경로 — PR #121이 넣었던 숙제 퀴즈 페널티를 사용자 확인 후 제거했다
// (지시서 7번: "거절 선택 시: 보상 없이 모달을 닫고 즉시 학습 화면으로
// 복귀합니다. 어떠한 페널티도 없음"). 거절은 이제 모달을 닫는 것
// 외에 아무 일도 일으키지 않는다 — 용돈도 그대로, 숙제 퀴즈도 뜨지
// 않는다.
test('declining the errand event closes the modal immediately with no penalty and no reward', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() },
        }),
      })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: {
            id: 1,
            user_id: USER.id,
            companion_type: body.companionType,
            stage: 'child',
            profession: body.profession,
            custom_profession_label: body.customProfessionLabel ?? null,
            level: 1,
            exp: 0,
            created_at: new Date().toISOString(),
          },
        }),
      })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-decline',
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
  await page.getByTestId('character-create-nuri').click()
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

  await teachThreeTimes('round0') // 배고픔 이벤트
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  await teachThreeTimes('round1') // 심부름 이벤트 — 이번엔 거절한다.
  await expect(page.getByTestId('errand-event-modal')).toBeVisible()
  await page.getByTestId('errand-event-decline-button').click()

  // 모달이 닫히고, 그 외에는 아무 일도 일어나지 않는다 — 숙제 퀴즈
  // 없이 바로 학습 화면(메뉴)으로 돌아가고, 용돈도 식사(-10,000원)
  // 뒤 그대로 90,000원이다.
  await expect(page.getByTestId('errand-event-modal')).not.toBeVisible()
  await expect(page.getByTestId('homework-quiz-modal')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '가르치기' })).toBeVisible()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')
})

// 지시서(8세 엄마 심부름 이벤트 구현 및 중복 보상 방지) 3번 — "동일한
// 유저가 하루에 여러 번 이벤트를 발생시켜 용돈을 중복으로 받지
// 못하도록" — 오늘 한 번 보상을 받고 나면, 같은 날 안에는 심부름
// 이벤트 자체가 다시 뜨지 않아야 한다(모달이 아예 안 뜨므로 중복
// 수락도 구조적으로 불가능하다).
test('accepting the errand event once blocks it from firing again the same day (no duplicate reward)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  await mockCharacterApi(page, {
    characters: [],
    onCreate: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          character: { id: 1, user_id: USER.id, companion_type: body.companionType, stage: 'child', profession: null, level: 1, exp: 0, created_at: new Date().toISOString() },
        }),
      })
    },
    onSetProfession: async (route) => {
      const body = route.request().postDataJSON() as { companionType: string; profession: string; customProfessionLabel?: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: {
            id: 1,
            user_id: USER.id,
            companion_type: body.companionType,
            stage: 'child',
            profession: body.profession,
            custom_profession_label: body.customProfessionLabel ?? null,
            level: 1,
            exp: 0,
            created_at: new Date().toISOString(),
          },
        }),
      })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-dedup',
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
  await page.getByTestId('character-create-nuri').click()
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

  await teachThreeTimes('round0') // 배고픔 이벤트
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  await teachThreeTimes('round1') // 심부름 이벤트 1회차 — 수락해서 오늘치를 받는다.
  await expect(page.getByTestId('errand-event-modal')).toBeVisible()
  await page.getByTestId('errand-event-accept-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('100,000원')

  await teachThreeTimes('round2') // 배고픔 이벤트가 다시 번갈아 뜬다.
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')

  // 심부름 차례가 다시 와도, 오늘 이미 받았으므로 모달 자체가 뜨지
  // 않는다(용돈도 그대로) — "이미 보상을 받은 상태라면 이벤트가 다시
  // 발생하지 않도록 처리하세요".
  await teachThreeTimes('round3')
  await expect(page.getByTestId('errand-event-modal')).toHaveCount(0)
  await expect(page.getByTestId('mock-wallet-balance')).toContainText('90,000원')
})

// 지시서("8세 완료 후 10대 레벨업 트랜지션" 전면 점검) + 지시서(학습
// 플로우 전면 개편)로 흐름 자체가 바뀌었다: 더 이상 유형별 2개씩 자유
// 순서가 아니라, toddler(8~9살)는 "1단계 직접입력 3문제(knowhow) →
// 2단계 객관식 2문제(세트 전부 정답, objective) → 3단계 주관식
// 1문제(subjective)"라는 고정 순서로 정확히 6개(3+2+1)를 채워야
// 진화한다(사용자 승인: "게이트를 3:2:1로 변경"). 이 테스트는 그 세
// 단계를 실제 UI로 끝까지 따라가, 토들러의 "6개 저장" 보상(지시서(서점
// 팝업 흐름 수정) 이후로는 식사·알바 2단계 로테이션이라 정확히 2번째
// 로테이션인 알바 이벤트가 2단계의 객관식 통과+3단계 완료가 겹치는
// 6번째 저장에서 함께 발동함)과 겹치는 실제 상황에서도 진화 배너·
// 캐릭터 그림·상태창이 전부 올바르게 바뀌는지 확인한다.
test('evolving from toddler to teen via the new 3-stage flow (direct×3 → objective quiz×2 → subjective×1) shows the evolution banner and swaps the portrait to teen — even though it coincides with the part-time job event', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  const REQUIRED = { knowhow: 3, objective: 2, subjective: 1 }
  const confirmed = { objective: 0, subjective: 0, knowhow: 0 }
  const missionProgressFor = () => ({
    ageTier: 'toddler',
    ageTierLabel: '8~9살',
    byType: {
      objective: { type: 'objective', confirmed: confirmed.objective, required: REQUIRED.objective, complete: confirmed.objective >= REQUIRED.objective },
      subjective: { type: 'subjective', confirmed: confirmed.subjective, required: REQUIRED.subjective, complete: confirmed.subjective >= REQUIRED.subjective },
      knowhow: { type: 'knowhow', confirmed: confirmed.knowhow, required: REQUIRED.knowhow, complete: confirmed.knowhow >= REQUIRED.knowhow },
      card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
    },
    confirmedTotal: confirmed.objective + confirmed.subjective + confirmed.knowhow,
    requiredTotal: 6,
    allConfirmed: confirmed.objective >= REQUIRED.objective && confirmed.subjective >= REQUIRED.subjective && confirmed.knowhow >= REQUIRED.knowhow,
    nextAgeTier: 'teen',
    nextAgeTierLabel: '10대',
  })
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onMissions: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missionProgress: missionProgressFor() }) })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-evolve',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      const body = route.request().postDataJSON() as { missionType: keyof typeof confirmed }
      confirmed[body.missionType] = Math.min(confirmed[body.missionType] + 1, REQUIRED[body.missionType])
      const progress = missionProgressFor()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: progress.allConfirmed ? '청소년 단계로 성장했어요!' : '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
          missionProgress: progress,
          ...(progress.allConfirmed ? { evolved: true, newAgeTier: 'teen', newAgeTierLabel: '10대' } : {}),
        }),
      })
    },
    onObjectiveQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          questions: [
            { id: 'evolve-obj-1', text: '객관식 문제 1', choices: ['정답', '오답'] },
            { id: 'evolve-obj-2', text: '객관식 문제 2', choices: ['정답', '오답'] },
          ],
          quizToken: 'tok-evolve-objective-quiz',
        }),
      })
    },
    onObjectiveQuizSubmit: async (route) => {
      saveCount += 2
      confirmed.objective = Math.min(confirmed.objective + 2, REQUIRED.objective)
      const progress = missionProgressFor()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          allCorrect: true,
          results: [
            { questionId: 'evolve-obj-1', correct: true },
            { questionId: 'evolve-obj-2', correct: true },
          ],
          message: '정답이에요! 2문제 모두 맞혔어요.',
          expAwarded: 20,
          exp: saveCount * 10,
          level: 1,
          leveledUp: false,
          missionProgress: progress,
          evolved: false,
          newAgeTier: null,
          newAgeTierLabel: null,
        }),
      })
    },
  })

  await page.goto('/grow')

  // 1단계: 직접입력 3문제(knowhow) — 3번째 저장 직후 배고픔 이벤트
  // 모달로 패널이 자동으로 닫힌다(기존 패턴과 동일). 저장 성공 핸들러가
  // title/content를 비동기로 비우므로, 다음 입력을 채우기 전에 그게
  // 끝났는지 확인한다(기존 "completing 3 knowledge saves" 테스트와
  // 같은 이유).
  const teachKnowhow = async (n: number) => {
    await page.getByPlaceholder('지식 제목').fill(`노하우 ${n}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${n}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
  }

  await page.getByRole('button', { name: '가르치기' }).click()
  await teachKnowhow(1)
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  await teachKnowhow(2)
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  await teachKnowhow(3)
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')

  // 2단계: 객관식 2문제(세트 전부 정답) — 둘 다 "정답"(선택지 0번)을
  // 고르고 제출하면 통과한다.
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('objective-quiz-step')).toBeVisible()
  await page.getByTestId('objective-quiz-choice-0-0').click()
  await page.getByTestId('objective-quiz-choice-1-0').click()
  await page.getByTestId('objective-quiz-submit-button').click()
  await expect(page.getByTestId('final-subjective-step')).toBeVisible()

  // 3단계: 주관식 1문제(개인 노하우) — 이 저장이 "유형별로 정해진
  // 개수(3+2+1)"를 완성시키는 마지막 저장이고, 토들러의 "6개 저장"
  // 보상(알바 이벤트)도 정확히 같은 저장에서 함께 발동한다.
  await page.getByTestId('final-subjective-textarea').fill('모르는 건 부끄러운 게 아니야, 꼭 물어봐도 괜찮아!')
  await page.getByTestId('final-subjective-complete-button').click()

  // 진화 배너가 뜬다 — 같은 저장에서 동시에 열리는 알바 연출에 가려지지
  // 않고 실제로 보이는지 확인한다(핵심 회귀 포인트).
  await expect(page.getByTestId('evolution-banner')).toBeVisible()
  await expect(page.getByTestId('evolution-banner')).toContainText('청소년')

  // 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트) 이후
  // toddler는 "알바" 자리에서 선택형 심부름 이벤트가 뜬다 — 이 저장
  // 자체가 teen으로 "방금" 진화시킨 저장이지만, 그 판정에 쓰인
  // ageTier 클로저는 이 저장이 일어난 "그 순간"(아직 toddler) 기준
  // 이라 심부름이 맞다.
  await expect(page.getByTestId('errand-event-modal')).toBeVisible()
  await page.getByTestId('errand-event-accept-button').click()
  await expect(page.getByTestId('money-popup')).toContainText('10,000원')

  // 모든 연출이 끝난 뒤 — 실제 화면의 캐릭터 그림이 teen(10대) 일러스트로
  // 바뀌어 있어야 한다(지시서의 핵심 요구사항: "8세에 머물러 있지 않고
  // 10대로 넘어간다").
  await expect(page.getByTestId('illustrated-age-portrait-nuri')).toHaveAttribute('src', /nuri-teen/)
})

// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen(10대)은 더 이상
// 균등분배가 아니라 "①직접입력 3 → ②직업 카드 맞추기 1 → ③직접입력 1
// → ④객관식 3 → ⑤개인 꿀팁/노하우 2"(합계 10)의 고정 순서다. 사이드바에
// 있던 '직업 카드 맞추기' 게임이 ②단계 안에 그대로 임베드되어, 6쌍을
// 전부 맞추면 자동으로 complete-card-game → save-knowledge(card_game)로
// 이어지는지, 10문제를 모두 마치면 junior_20s(20대)로 진화하고 다음
// 미션 총량이 20으로 갱신되는지까지 끝까지 확인한다.
test('completing the teen (10대) 10-step curriculum — direct×3 → embedded card-match game → direct×1 → objective quiz×3 → direct×2 — evolves to junior_20s (20대) and refreshes the next mission total to 20', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  let saveCount = 0
  const REQUIRED = { objective: 3, subjective: 0, knowhow: 6, card_game: 1 }
  const confirmed = { objective: 0, subjective: 0, knowhow: 0, card_game: 0 }
  const missionProgressFor = () => ({
    ageTier: 'teen',
    ageTierLabel: '10대',
    byType: {
      objective: { type: 'objective', confirmed: confirmed.objective, required: REQUIRED.objective, complete: confirmed.objective >= REQUIRED.objective },
      subjective: { type: 'subjective', confirmed: confirmed.subjective, required: REQUIRED.subjective, complete: confirmed.subjective >= REQUIRED.subjective },
      knowhow: { type: 'knowhow', confirmed: confirmed.knowhow, required: REQUIRED.knowhow, complete: confirmed.knowhow >= REQUIRED.knowhow },
      card_game: { type: 'card_game', confirmed: confirmed.card_game, required: REQUIRED.card_game, complete: confirmed.card_game >= REQUIRED.card_game },
    },
    confirmedTotal: confirmed.objective + confirmed.subjective + confirmed.knowhow + confirmed.card_game,
    requiredTotal: 10,
    allConfirmed:
      confirmed.objective >= REQUIRED.objective &&
      confirmed.subjective >= REQUIRED.subjective &&
      confirmed.knowhow >= REQUIRED.knowhow &&
      confirmed.card_game >= REQUIRED.card_game,
    nextAgeTier: 'junior_20s',
    nextAgeTierLabel: '20대',
  })
  // junior_20s(20대)는 이번 지시서 범위 밖이라 기존 균등분배 그대로다
  // (characterAge.ts의 splitMissionsRequiredByType(20) = 7+7+6+0).
  const junior20sMissionProgress = {
    ageTier: 'junior_20s',
    ageTierLabel: '20대',
    byType: {
      objective: { type: 'objective', confirmed: 0, required: 7, complete: false },
      subjective: { type: 'subjective', confirmed: 0, required: 7, complete: false },
      knowhow: { type: 'knowhow', confirmed: 0, required: 6, complete: false },
      card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
    },
    confirmedTotal: 0,
    requiredTotal: 20,
    allConfirmed: false,
    nextAgeTier: 'career_30s',
    nextAgeTierLabel: '30대',
  }

  await mockCharacterApi(page, {
    characters: [{ ...NURI_ACCOUNTANT, age_tier: 'teen', level: 5 }],
    onMissions: async (route) => {
      const progress = missionProgressFor()
      const body = progress.allConfirmed ? junior20sMissionProgress : progress
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missionProgress: body }) })
    },
    onVerify: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          verification: { status: 'appropriate', explanation: 'ok', relevance: 'ok', issues: '', suggestion: '' },
          verificationToken: 'tok-teen-evolve',
          characterReply: '알려주셔서 고마워요!',
          remaining: 9,
          dailyTeachLimit: 10,
        }),
      })
    },
    onSave: async (route) => {
      saveCount += 1
      const body = route.request().postDataJSON() as { missionType: keyof typeof confirmed }
      confirmed[body.missionType] = Math.min(confirmed[body.missionType] + 1, REQUIRED[body.missionType])
      const progress = missionProgressFor()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { id: saveCount, character_id: 1, profession: 'accountant', title: 'x', original_content: 'y', final_content: 'y', verification_status: 'appropriate', source: 'user_taught', created_at: new Date().toISOString() },
          savedReply: progress.allConfirmed ? '청년 단계로 성장했어요!' : '배웠어요!',
          expAwarded: 10,
          exp: saveCount * 10,
          level: 5,
          leveledUp: false,
          missionProgress: progress,
          ...(progress.allConfirmed ? { evolved: true, newAgeTier: 'junior_20s', newAgeTierLabel: '20대' } : {}),
        }),
      })
    },
    onCompleteCardGame: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          knowledge: { title: '직업 카드 맞추기 완료', content: '직업 카드와 도구 카드를 모두 맞춰서 한 세트를 클리어했습니다.' },
          verification: { status: 'appropriate', explanation: '모든 카드를 맞췄어요!', relevance: '', issues: '', suggestion: '' },
          verificationToken: 'tok-teen-card-game',
          characterReply: '우와, 카드를 다 맞췄어요! 정말 멋져요!',
        }),
      })
    },
    onObjectiveQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          questions: [
            { id: 'teen-obj-1', text: '객관식 문제 1', choices: ['정답', '오답'] },
            { id: 'teen-obj-2', text: '객관식 문제 2', choices: ['정답', '오답'] },
            { id: 'teen-obj-3', text: '객관식 문제 3', choices: ['정답', '오답'] },
          ],
          quizToken: 'tok-teen-objective-quiz',
        }),
      })
    },
    onObjectiveQuizSubmit: async (route) => {
      saveCount += 3
      confirmed.objective = Math.min(confirmed.objective + 3, REQUIRED.objective)
      const progress = missionProgressFor()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          allCorrect: true,
          results: [
            { questionId: 'teen-obj-1', correct: true },
            { questionId: 'teen-obj-2', correct: true },
            { questionId: 'teen-obj-3', correct: true },
          ],
          message: '정답이에요! 3문제 모두 맞혔어요.',
          expAwarded: 30,
          exp: saveCount * 10,
          level: 5,
          leveledUp: false,
          missionProgress: progress,
          evolved: false,
          newAgeTier: null,
          newAgeTierLabel: null,
        }),
      })
    },
  })

  await page.goto('/grow')

  const teachKnowhow = async (n: number) => {
    await page.getByPlaceholder('지식 제목').fill(`노하우 ${n}`)
    await page.getByTestId('knowledge-content-textarea').fill(`내용 ${n}`)
    await page.getByRole('button', { name: 'AI검증하기' }).click()
    await page.getByRole('button', { name: '저장' }).click()
  }

  // ①단계: 직접입력 3문제(knowhow) — 3번째 저장 직후 식사 이벤트로
  // 패널이 자동으로 닫힌다(기존 패턴과 동일).
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('teen-direct-step-label')).toContainText('①단계')
  await teachKnowhow(1)
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  await teachKnowhow(2)
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('')
  await teachKnowhow(3)
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')

  // ②단계: 직업 카드 맞추기 — 사이드바 게임이 그대로 학습 모달 안에
  // 임베드되어 있다. 6쌍을 모두 맞추면 onCleared가 자동으로
  // complete-card-game → save-knowledge(card_game)까지 이어간다.
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('teen-card-game-step')).toBeVisible()
  for (let i = 0; i < 6; i++) {
    const backs = page.getByTestId('card-match-back')
    const ids = await backs.evaluateAll((els) => els.map((el) => el.getAttribute('data-job-id')))
    const jobId = [...new Set(ids.filter((id): id is string => id !== null))][0]
    await page.locator(`[data-job-id="${jobId}"][data-kind="job"]`).click()
    await page.locator(`[data-job-id="${jobId}"][data-kind="tool"]`).click()
  }

  // 지시서(10대 전용 알바 시스템): 카드 맞추기 클리어 직후, 기존
  // "3회 저장" 로테이션과 무관한 전용 트리거(onTeenJobEventDue)로 알바
  // 이벤트 ①회차가 곧바로 뜬다 — 걷기 연출(타이머)이 끝나면 설거지/
  // 서빙/편의점 중 한 곳에 도착해 3문제를 낸다. 3문제 모두 맞혀
  // 30,000원을 받는다.
  await expect(page.getByTestId('job-event-modal')).toBeVisible()
  await expect(page.getByTestId('job-event-shop-label')).toContainText(/설거지 알바|서빙 알바|편의점 알바/)
  await answerJobEventQuiz(page, true)
  await expect(page.getByTestId('job-event-success-message')).toBeVisible()
  await page.getByTestId('job-event-return-button').click()
  await expect(page.getByTestId('money-popup')).toContainText('30,000원')

  // ③단계: 직접입력 1문제(knowhow) — 알바 이벤트가 끝난 뒤 패널을 다시
  // 열어서 이어간다(식사/알바 이벤트와 같은 "패널 닫고 다시 열기" 패턴).
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('teen-direct-step-label')).toContainText('③단계')
  await teachKnowhow(4)

  // ④단계: 객관식 3문제(세트 전부 정답 필요) — toddler(2문제)와 달리
  // teen은 3문제를 받는다.
  await expect(page.getByTestId('objective-quiz-step')).toBeVisible()
  await expect(page.getByTestId('objective-quiz-question-2')).toBeVisible()
  await page.getByTestId('objective-quiz-choice-0-0').click()
  await page.getByTestId('objective-quiz-choice-1-0').click()
  await page.getByTestId('objective-quiz-choice-2-0').click()
  await page.getByTestId('objective-quiz-submit-button').click()

  // 객관식 3문제 통과가 정확히 기존 "3회 저장" 로테이션의 알바 자리와
  // 겹친다 — teen은 이 자리에서 (toddler의 심부름처럼) 알바 이벤트
  // ②회차를 받는다. 이번엔 일부러 1문제를 틀려 "1문제라도 틀리면 0원"
  // 규칙을 검증한다.
  await expect(page.getByTestId('job-event-modal')).toBeVisible()
  await answerJobEventQuiz(page, false)
  await expect(page.getByTestId('job-event-fail-message')).toBeVisible()
  await page.getByTestId('job-event-return-button').click()

  // ⑤단계: 개인 꿀팁/노하우 2문제(knowhow) — 알바 이벤트가 끝난 뒤 다시
  // 열어서 이어간다. 그 첫 번째 저장이 또 한 번 "3회 저장" 경계와
  // 맞아떨어져 식사 이벤트가 한 번 더 끼어든다.
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('teen-direct-step-label')).toContainText('⑤단계')
  await teachKnowhow(5)
  await expect(page.getByTestId('hungry-event-modal')).toBeVisible()
  await page.getByTestId('hungry-event-feed-button').click()
  await expect(page.getByTestId('speech-bubble')).toContainText('냠냠')

  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('teen-direct-step-label')).toContainText('⑤단계')
  await teachKnowhow(6)

  // 10문제를 모두 마치면 20대(junior_20s)로 진화한다.
  await expect(page.getByTestId('evolution-banner')).toBeVisible()
  await expect(page.getByTestId('evolution-banner')).toContainText('청년')

  // teen의 10단계가 끝났다고 이전 진행도가 새 단계에 남아있지 않고,
  // 다음 미션 총량이 junior_20s 기준(20)으로 정확히 갱신된다 — 진화
  // 자체는 패널을 닫지 않으므로(식사/알바 이벤트와 다름), 일단 닫고
  // 다시 열어야 missions GET이 새 연령대로 다시 불려 갱신된다.
  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('mission-progress-summary')).toContainText('20대 성장 미션 (0/20)')
})

// 지시서(학습 플로우 전면 개편) 요청 3번: 2단계 객관식 2문제는 "세트"
// 단위로 전부 맞혀야 통과한다 — 하나라도 틀리면 세트 전체가 처음부터
// 다시 나온다(무한 반복). 1단계(직접입력 3문제)를 이미 끝낸 캐릭터로
// 시작해 2단계에 곧장 진입시킨다.
test('getting an objective quiz question wrong resets the whole pair and serves a fresh set, until both are answered correctly', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  const missionProgressAtObjectiveStep = {
    ageTier: 'toddler',
    ageTierLabel: '8~9살',
    byType: {
      objective: { type: 'objective', confirmed: 0, required: 2, complete: false },
      subjective: { type: 'subjective', confirmed: 0, required: 1, complete: false },
      knowhow: { type: 'knowhow', confirmed: 3, required: 3, complete: true },
      card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
    },
    confirmedTotal: 3,
    requiredTotal: 6,
    allConfirmed: false,
    nextAgeTier: 'teen',
    nextAgeTierLabel: '10대',
  }
  // attempt는 "GET이 몇 번 불렸는지"가 아니라 "오답을 몇 번 제출했는지"로만
  // 올린다 — React StrictMode(dev 서버) 아래에서 마운트 시 GET이 두 번
  // 불려도(effect 중복 실행) 매번 같은 세트를 돌려주므로 테스트가
  // 흔들리지 않는다.
  let attempt = 0
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onMissions: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missionProgress: missionProgressAtObjectiveStep }) })
    },
    onObjectiveQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          questions: [
            { id: `retry-obj-1-${attempt}`, text: `문제 1 (세트 ${attempt + 1})`, choices: ['정답', '오답'] },
            { id: `retry-obj-2-${attempt}`, text: `문제 2 (세트 ${attempt + 1})`, choices: ['정답', '오답'] },
          ],
          quizToken: `tok-retry-${attempt}`,
        }),
      })
    },
    onObjectiveQuizSubmit: async (route) => {
      const body = route.request().postDataJSON() as { quizToken: string; answers: [number, number] }
      // 첫 번째 세트(attempt===0)는 일부러 둘 다 오답(선택지 1번)으로
      // 보내 틀리게 하고, 다시 받은 두 번째 세트는 둘 다 정답(선택지
      // 0번)으로 통과시킨다.
      const allCorrect = body.quizToken !== 'tok-retry-0'
      if (!allCorrect) attempt += 1
      await route.fulfill({
        status: allCorrect ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          allCorrect,
          results: [
            { questionId: 'x', correct: allCorrect },
            { questionId: 'y', correct: allCorrect },
          ],
          message: allCorrect ? '정답이에요! 2문제 모두 맞혔어요.' : '앗, 틀렸어요! 다시 도전해 볼까요?',
          expAwarded: allCorrect ? 20 : 0,
          exp: 50,
          level: 1,
          leveledUp: false,
          missionProgress: allCorrect
            ? { ...missionProgressAtObjectiveStep, byType: { ...missionProgressAtObjectiveStep.byType, objective: { type: 'objective', confirmed: 2, required: 2, complete: true } }, confirmedTotal: 5 }
            : null,
          evolved: false,
          newAgeTier: null,
          newAgeTierLabel: null,
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('objective-quiz-step')).toBeVisible()
  await expect(page.getByTestId('objective-quiz-question-0')).toContainText('세트 1')

  // 일부러 오답을 고르고 제출한다.
  await page.getByTestId('objective-quiz-choice-0-1').click()
  await page.getByTestId('objective-quiz-choice-1-1').click()
  await page.getByTestId('objective-quiz-submit-button').click()

  await expect(page.getByTestId('objective-quiz-wrong-notice')).toContainText('앗, 틀렸어요! 다시 도전해 볼까요?')

  // "새 문제로 다시 도전하기"를 누르면 완전히 새 세트(2번째 GET)가
  // 온다 — 같은 두 문제가 반복되지 않는다.
  await page.getByTestId('objective-quiz-retry-button').click()
  await expect(page.getByTestId('objective-quiz-question-0')).toContainText('세트 2')

  // 이번엔 정답을 고르면 통과하고, 3단계(주관식)로 넘어간다.
  await page.getByTestId('objective-quiz-choice-0-0').click()
  await page.getByTestId('objective-quiz-choice-1-0').click()
  await page.getByTestId('objective-quiz-submit-button').click()
  await expect(page.getByTestId('final-subjective-step')).toBeVisible()
})

// 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장): 선택지
// 개수가 연령대별로 늘어나므로(토들러 3 ~ 60대 15), 화면에는 실제로
// 서버가 내려준 만큼의 보기 버튼이 그려지고, 10개 이상일 때만 2열
// 그리드로 바뀌는지(완료조건 "반응형 디자인 고려") 직접 확인한다.
test('objective quiz choices render in a 2-column grid once there are 10+ options, and a single column below that', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  const missionProgressAtObjectiveStep = {
    ageTier: 'toddler',
    ageTierLabel: '8~9살',
    byType: {
      objective: { type: 'objective', confirmed: 0, required: 2, complete: false },
      subjective: { type: 'subjective', confirmed: 0, required: 1, complete: false },
      knowhow: { type: 'knowhow', confirmed: 3, required: 3, complete: true },
      card_game: { type: 'card_game', confirmed: 0, required: 0, complete: true },
    },
    confirmedTotal: 3,
    requiredTotal: 6,
    allConfirmed: false,
    nextAgeTier: 'teen',
    nextAgeTierLabel: '10대',
  }
  await mockCharacterApi(page, {
    characters: [NURI_ACCOUNTANT],
    onMissions: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ missionProgress: missionProgressAtObjectiveStep }) })
    },
    onObjectiveQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          // 지시서 완료조건 예시(연령대별 선택지 개수)에 맞춰, 1번
          // 문제는 50대(13개, 아직 한 자리 미만인 토들러 3개와 대비)
          // 보기를, 2번 문제는 10개 미만(toddler 기준 3개)인 보기를
          // 섞어 같은 화면 안에서 2열/1열이 함께 올바르게 갈리는지 본다.
          questions: [
            { id: 'wide-obj-1', text: '보기 13개짜리 문제', choices: Array.from({ length: 13 }, (_, i) => `보기 ${i + 1}`) },
            { id: 'wide-obj-2', text: '보기 3개짜리 문제', choices: ['보기 1', '보기 2', '보기 3'] },
          ],
          quizToken: 'tok-wide-choices',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()
  await expect(page.getByTestId('objective-quiz-step')).toBeVisible()

  await expect(page.getByTestId('objective-quiz-choice-0-0')).toHaveCount(1)
  await expect(page.locator('[data-testid="objective-quiz-choices-0"] button')).toHaveCount(13)
  await expect(page.getByTestId('objective-quiz-choices-0')).toHaveClass(/sm:grid-cols-2/)

  await expect(page.locator('[data-testid="objective-quiz-choices-1"] button')).toHaveCount(3)
  await expect(page.getByTestId('objective-quiz-choices-1')).not.toHaveClass(/sm:grid-cols-2/)
})
