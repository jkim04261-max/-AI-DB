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
    onStudyGenerate?: (route: Route) => Promise<void>
    onListMessages?: (route: Route) => Promise<void>
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
  await page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.').fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()

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
  await page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.').fill('잘못된 내용')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()

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
  await page.getByRole('button', { name: '누리 스스로 공부하기' }).click()

  // The composer is filled with what the character generated, so the user
  // can review it before saving — self-study never auto-saves either.
  await expect(page.getByPlaceholder('지식 제목')).toHaveValue('복식부기')
  await expect(page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.')).toHaveValue('거래를 차변과 대변에 동시에 기록한다.')
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
  await page.getByPlaceholder('가르칠 지식 내용을 입력해주세요.').fill('거래를 두 번 기록한다')
  await page.getByRole('button', { name: 'Gemini 검증하기' }).click()
  await expect(page.getByText('알려주셔서 고마워요!', { exact: false })).toBeVisible()

  // Then self-study, in the exact same panel — no navigation, no mode
  // switch, no separate screen.
  await page.getByRole('button', { name: '누리 스스로 공부하기' }).click()
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
