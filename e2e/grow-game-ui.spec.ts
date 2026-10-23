import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe } from './fixtures/mock-api'

// PR #46: the new 2.5D-style game screen's own wiring — menu items that
// didn't exist before this PR ("함께 대화하기"/"성장 보기"/"앨범·기록"),
// the character tap reaction, and the XP visual effect. All mocked, no
// real DB/Gemini/Vercel call. See e2e/README.md.
const USER = { id: 1, email: 'alice@test.com' }
const NURI_SINGER = {
  id: 1,
  user_id: USER.id,
  companion_type: 'nuri',
  stage: 'child',
  profession: 'singer',
  level: 1,
  exp: 40,
  created_at: new Date().toISOString(),
}

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

async function mockCharacterApi(
  page: Page,
  options: {
    characters?: unknown[]
    onListMessages?: (route: Route) => Promise<void>
    onListKnowledge?: (route: Route) => Promise<void>
    onExam?: (route: Route) => Promise<void>
    onQuiz?: (route: Route) => Promise<void>
    onQuizSubmit?: (route: Route) => Promise<void>
  },
) {
  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'messages') {
      if (options.onListMessages) {
        await options.onListMessages(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'knowledge') {
      if (options.onListKnowledge) {
        await options.onListKnowledge(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], total: 0 }) })
      return
    }
    if (method === 'GET' && action === 'exam') {
      if (options.onExam) {
        await options.onExam(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
      return
    }
    if (method === 'GET' && action === 'quiz' && options.onQuiz) {
      await options.onQuiz(route)
      return
    }
    if (method === 'POST' && action === 'quiz-submit' && options.onQuizSubmit) {
      await options.onQuizSubmit(route)
      return
    }
    if (method === 'GET' && !action) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: options.characters ?? [] }) })
      return
    }
    await route.fallback()
  })
}

test('"함께 대화하기" opens a read-only view of the persisted conversation (not a new live chat)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER],
    onListMessages: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 2,
          messages: [
            { id: 1, character_id: 1, speaker: 'user', source: 'user_taught', content: '복식호흡\n숨을 깊게 들이쉰다', verification_status: null, knowledge_entry_id: null, created_at: new Date().toISOString() },
            { id: 2, character_id: 1, speaker: 'character', source: 'user_taught', content: '알려주셔서 고마워요!', verification_status: 'appropriate', knowledge_entry_id: 10, created_at: new Date().toISOString() },
          ],
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '함께 대화하기' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('그동안', { exact: false })).toBeVisible()
  await expect(dialog.getByText('복식호흡\n숨을 깊게 들이쉰다')).toBeVisible()
  await expect(dialog.getByText('알려주셔서 고마워요!', { exact: false })).toBeVisible()
  // 읽기 전용 — 새 메시지를 보낼 입력창이 없다(실제로 구현되지 않은
  // "실시간 대화" 기능을 있는 것처럼 보이지 않기 위함).
  await expect(dialog.getByPlaceholder(/.+/)).toHaveCount(0)
})

test('"성장 보기" shows level/XP, profession, exam status and the learning record — all from existing data', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER],
    onExam: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: true }) })
    },
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
              profession: 'singer',
              title: '복식호흡',
              original_content: '숨을 깊게 들이쉰다',
              final_content: '숨을 깊게 들이쉰다',
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
  await page.getByRole('button', { name: '성장 보기' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Lv.1', { exact: false })).toBeVisible()
  await expect(dialog.getByText('40/100', { exact: false })).toBeVisible()
  await expect(dialog.getByText('자격시험 합격', { exact: false })).toBeVisible()
  await expect(dialog.getByText('복식호흡')).toBeVisible()
})

test('"앨범·기록" is honest about the missing photo album and reuses the real learning record instead of faking one', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '앨범·기록' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('준비 중', { exact: false })).toBeVisible()
  await expect(dialog.getByText('아직 가르치거나 배운 지식이 없어요.')).toBeVisible()
})

test('tapping the character shows a short speech-bubble reaction', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByTestId('character-tap-target').click()

  await expect(page.getByText('안녕하세요!')).toBeVisible()
})

test('a correct quiz answer shows a floating +XP visual effect on the stage', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER],
    onQuiz: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ question: { id: 'singer-1', text: '복식호흡이란?', choices: ['배로 숨쉬기', '가슴으로 숨쉬기', '숨 참기', '빠르게 숨쉬기'] } }),
      })
    },
    onQuizSubmit: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          correct: true,
          explanation: '배로 숨을 쉬는 발성 기초예요.',
          expAwarded: 5,
          exp: 45,
          level: 1,
          leveledUp: false,
          message: '정답이에요! (+5XP)',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '문제 풀기' }).click()
  await page.getByRole('button', { name: /퀴즈 풀기/ }).click()
  await page.getByRole('button', { name: '배로 숨쉬기' }).click()
  await page.getByRole('button', { name: '제출' }).click()

  await expect(page.getByText('+5 XP')).toBeVisible()
})
