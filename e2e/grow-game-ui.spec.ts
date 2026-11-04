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
    onUsage?: (route: Route) => Promise<void>
    onSetProfession?: (route: Route) => Promise<void>
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
    if (method === 'GET' && action === 'usage') {
      if (options.onUsage) {
        await options.onUsage(route)
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teachRemaining: 10, teachLimit: 10, studyRemaining: 3, studyLimit: 3 }) })
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
    // PR #52: 직업 저장(PATCH) — 고른 직업을 그대로 반영한 캐릭터를
    // 돌려준다(기존 목록의 해당 캐릭터를 찾아 profession만 덮어씀).
    if (method === 'PATCH') {
      if (options.onSetProfession) {
        await options.onSetProfession(route)
        return
      }
      const body = route.request().postDataJSON() as { companionType?: string; profession?: string }
      const base = (options.characters ?? []).find(
        (c): c is Record<string, unknown> => typeof c === 'object' && c !== null && (c as Record<string, unknown>).companion_type === body.companionType,
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ character: { ...base, profession: body.profession } }),
      })
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

// PR #47 체크포인트 1: 지식/업무/소통/창의 스탯 게이지 — DB 스키마 변경
// 없이, 이미 읽어오는 지식 목록/대화 수/시험 합격 여부를 그 자리에서
// 0~100으로 환산해 메인 화면에 바로 보여준다(characterStats.ts).
test('the main screen shows 4 real-time stat gauges computed from existing data (no new DB fields)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER],
    onListMessages: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 3, messages: [] }) })
    },
    onListKnowledge: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 2,
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
            {
              id: 2,
              character_id: 1,
              profession: 'singer',
              title: '발성',
              original_content: '목을 편하게',
              final_content: '목을 편하게',
              verification_status: 'appropriate',
              verification_explanation: '정확해요',
              source: 'ai_generated',
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
    },
    onExam: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: true }) })
    },
  })

  await page.goto('/grow')

  await expect(page.getByTestId('stat-gauges')).toBeVisible()
  // NURI_SINGER(직업: 가수)의 PR #48 직업별 가중치(지식 0.9/업무 0.8/
  // 소통 1.2/창의 1.3) 적용 — 지식 = 2건*10*0.9 = 18, 소통 = 3건*4*1.2
  // = 14(소수점 반올림), 창의 = 1건*20*1.3 = 26, 업무 = 시험 합격 100*0.8
  // = 80.
  await expect(page.getByTestId('stat-gauge-knowledge')).toHaveAttribute('style', /width:\s*18%/)
  await expect(page.getByTestId('stat-gauge-communication')).toHaveAttribute('style', /width:\s*14%/)
  await expect(page.getByTestId('stat-gauge-creativity')).toHaveAttribute('style', /width:\s*26%/)
  await expect(page.getByTestId('stat-gauge-work')).toHaveAttribute('style', /width:\s*80%/)
})

// PR #47 체크포인트 1: 레벨이 실제로 오를 때만(단순 XP 획득과 구분되는)
// 더 눈에 띄는 축하 연출을 보여준다.
test('leveling up (not just gaining XP) shows a distinct level-up celebration on the stage', async ({ page }) => {
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
          expAwarded: 60,
          exp: 0,
          level: 2,
          leveledUp: true,
          message: '레벨업! (+60XP)',
        }),
      })
    },
  })

  await page.goto('/grow')
  await page.getByRole('button', { name: '문제 풀기' }).click()
  await page.getByRole('button', { name: /퀴즈 풀기/ }).click()
  await page.getByRole('button', { name: '배로 숨쉬기' }).click()
  await page.getByRole('button', { name: '제출' }).click()

  await expect(page.getByTestId('level-up-banner')).toBeVisible()
  await expect(page.getByTestId('level-up-banner')).toContainText('Lv.2')
})

// PR #47 체크포인트 1: 레벨에 따른 외형 분기 구조 — 레벨 6 이상이면
// 캐릭터에 작은 "전문가" 배지가 더해진다(실제 전신 일러스트 교체는
// 차후 별도 작업, 지금은 분기 구조와 최소 시각 차이만 확인한다).
test('a high-level character shows the expert appearance accessory, not just the base look', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, level: 6, exp: 600 }] })

  await page.goto('/grow')

  await expect(page.getByTestId('appearance-accessory-expert')).toBeVisible()
  await expect(page.getByTestId('appearance-accessory-student')).toHaveCount(0)
})

// PR #48 "게임 루프 강화": 퀘스트 배너 — 아직 가르친 지식이 없는
// 캐릭터에게는 "첫 지식을 가르쳐달라"는 퀘스트를 제안하고, "바로가기"를
// 누르면 그 자리에서 가르치기 패널이 바로 열린다(새 화면 전환 없음).
test('the quest banner suggests teaching first knowledge, and its CTA opens the right panel directly', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER],
    onExam: async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [], alreadyPassed: false }) })
    },
  })

  await page.goto('/grow')

  const banner = page.getByTestId('quest-banner')
  await expect(banner).toContainText('첫 지식을 가르쳐주시겠어요?')
  await banner.getByRole('button', { name: '바로가기' }).click()

  await expect(page.getByRole('dialog')).toContainText('가르치기')
})

// PR #48 "게임 루프 강화": 캐릭터가 먼저 말을 거는 효과 — 유저가 캐릭터를
// 탭하지 않아도, 화면에 들어오면 지금 추천하는 퀘스트 문구가 말풍선으로
// 자동으로 뜬다.
test('the character proactively speaks up with the current quest, without the user tapping it', async ({ page }) => {
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

  await expect(page.getByTestId('speech-bubble')).toContainText('오늘도 새로운 지식을 가르치거나 스스로 공부시켜보세요')
})

// PR #49: 상단 리소스 바 — 가짜 재화를 새로 만들지 않고, 실제 캐릭터
// exp("포인트")와 실제 서버 행동력 조회 값만 보여준다.
test('the top resource bar shows real points and energy, not fabricated numbers', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, {
    characters: [NURI_SINGER], // exp: 40
    onUsage: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teachRemaining: 7, teachLimit: 10, studyRemaining: 2, studyLimit: 3 }),
      })
    },
  })

  await page.goto('/grow')

  await expect(page.getByTestId('resource-bar')).toBeVisible()
  await expect(page.getByTestId('resource-points')).toHaveText('40')
  await expect(page.getByTestId('resource-energy')).toHaveText('9/13')
})

// PR #52: 캐릭터 6단계 연령대 — character.level에서 그때그때 계산하는
// 표시용 값(DB 변경 없음). Lv.1인 NURI_SINGER는 toddler(8~9살, 후속
// 5차에서 2~3살→8~9살로 상향) 단계다.
test('the HUD shows the character\'s current 6-stage age tier, derived from level', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] }) // level: 1 → toddler

  await page.goto('/grow')

  await expect(page.getByTestId('age-stage-label')).toContainText('초등 저학년')
})

// PR #52 후속 긴급 수정 요청 2번: 연령대별 비주얼이 실제로 화면에
// 반영되는지 — 기본(일러스트) 화면에서 연령대 배지가 실제로 보여야 한다.
test('the illustrated main stage actually shows the age-tier badge (not just computed, but rendered)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] }) // level: 1 → toddler

  await page.goto('/grow')

  const badge = page.getByTestId('age-badge-toddler')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('🎒')
})

// PR #52 후속 5차 요청 3번: 머리 위 나이 뱃지 — 티어와 별개로 구체적인
// 나이 숫자가 항상 보여야 한다(junior_20s처럼 연령대 이모지가 없는
// 티어에서도). Lv.1은 ageNumberForLevel 매핑상 8세다.
test('the character shows a specific age-number badge above the stage, not just the tier badge', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] }) // level: 1 → 8세

  await page.goto('/grow')

  await expect(page.getByTestId('age-number-badge')).toHaveText('8세')
})

// 마스터 단계(Lv.40+)는 요청하신 "장인증서" 배지로 바뀌어야 한다 —
// 레벨이 달라지면 같은 화면에서 다른 배지가 실제로 뜨는지 확인한다.
test('a master-tier (Lv.40+) character shows the 장인증서 badge instead of the toddler one', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, level: 45, exp: 90000 }] })

  await page.goto('/grow')

  await expect(page.getByTestId('age-badge-master-50s')).toBeVisible()
  await expect(page.getByTestId('age-badge-master-50s')).toContainText('🏆')
  await expect(page.getByTestId('age-badge-toddler')).toHaveCount(0)
  await expect(page.getByTestId('age-stage-label')).toContainText('마스터')
})

// PR #52 후속 4차: 기본 로비(일러스트 모드)는 PR #50의 고정된 한 장짜리
// 그림이라 배지/테두리만으로는 "캐릭터 자체가 바뀐다"는 느낌이 약했다
// — 유저가 실제 화면에서 연령대가 안 바뀐다고 재차 확인해준 뒤,
// 실제 연령대 초상화를 캐릭터 영역 위에 카드로 띄우도록 고쳤다.
// 레벨이 바뀌면(토들러→마스터) 이 카드의 그림 자체가 바뀌는지 검증한다.
test('the default (illustrated) lobby also shows the real age-tier portrait over the character, and swaps when the tier changes', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] }) // level: 1 → toddler

  await page.goto('/grow')

  const portrait = page.getByTestId('illustrated-age-portrait-nuri')
  await expect(portrait).toBeVisible()
  await expect(portrait).toHaveAttribute('src', /nuri-toddler/)

  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, level: 45, exp: 90000 }] })
  await page.reload()

  await expect(page.getByTestId('illustrated-age-portrait-nuri')).toHaveAttribute('src', /nuri-master_50s/)
})

// CSS 모드(마켓 배경)에서는 캐릭터 자체의 크기가 연령대에 따라 실제로
// 달라진다 — toddler는 더 작게, master는 더 크게 그려진다.
test('in a CSS-mode (purchased) background, the character visibly scales with its age tier', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, level: 45, exp: 90000 }] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '아이템 마켓' }).click()
  const dialog = page.getByRole('dialog', { name: '아이템 마켓' })
  await dialog.getByRole('button', { name: '배경', exact: true }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '구매하기' }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '장착하기' }).click()
  await page.getByRole('button', { name: '닫기' }).click()

  const wrapper = page.getByTestId('age-scale-wrapper')
  await expect(wrapper).toBeVisible()
  await expect(wrapper).toHaveCSS('transform', /matrix\(1\.08/)
})

// PR #52 후속 3차: 사용자가 제공한 연령대별 일러스트로 CSS 모드(마켓
// 구매 배경)의 손그림 SVG(파란 도형)를 실제 이미지로 교체했다 — 이
// 테스트가 "더 이상 도형이 아니라 진짜 그림이 뜬다"를 직접 검증한다.
test('in a CSS-mode (purchased) background, the character shows the real age-tier portrait image, not the SVG shape', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '아이템 마켓' }).click()
  const dialog = page.getByRole('dialog', { name: '아이템 마켓' })
  await dialog.getByRole('button', { name: '배경', exact: true }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '구매하기' }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '장착하기' }).click()
  await page.getByRole('button', { name: '닫기' }).click()

  const characterRegion = page.getByRole('img', { name: '누리 캐릭터, 대기 중' })
  await expect(characterRegion).toBeVisible()
  await expect(page.locator('svg.grow-sprite-pose-idle')).toHaveCount(0)
  const portrait = page.getByTestId('age-scale-wrapper').locator('img')
  await expect(portrait).toBeVisible()
  await expect(portrait).toHaveAttribute('src', /nuri-toddler/)
})

// PR #52 요청 2번: 처음 'AI 키우기'에 들어온(아직 직업이 없는) 캐릭터가
// 인사 + "직업을 선택해 주세요!" 안내를 보여준다 — 기존 PR #48의 "캐릭터가
// 먼저 말을 거는" 메커니즘을 그대로 탄다(새 모달이 아니라 이미 검증된
// 퀘스트 배너/말풍선 흐름).
test('a brand-new character greets the user and asks them to pick a profession', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, profession: null }] })

  await page.goto('/grow')

  await expect(page.getByText('안녕하세요! 저는 아직 아무것도 모르는 초등학생이에요. 직업을 선택해 주세요!')).toBeVisible()
})

// PR #52 요청 2번: 처음 직업을 고르면("요가강사" 등) 그 직업에 맞는
// 아동 말투 대사("나 OO 되고 싶어요! ...")가 바로 뜬다 — 나중에 레벨이
// 올라간 뒤 "직업 변경"을 할 때는 이 유아 대사를 보여주지 않는다
// (applyProfession의 isFirstPick 조건).
test('picking a profession for the first time shows a toddler-voiced line about that job', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, profession: null }] }) // level: 1 → toddler, 처음 선택

  await page.goto('/grow')
  await page.getByRole('button', { name: '직업 선택' }).click()

  const dialog = page.getByRole('dialog', { name: '직업 선택' })
  await dialog.getByRole('button', { name: '회계사' }).click()

  await expect(page.getByTestId('speech-bubble')).toContainText('나 회계사 되고 싶어요! 저에게 지식, 훈련, 강의를 가르쳐주세요!')
})

// PR #49에서 만든 50개 직업 카테고리형 팝업 셀렉터. PR #51(직업 선택
// 제한 해제)부터는 50개 전부 클릭해서 고를 수 있다 — 실제 시험 문제가
// 없는 48개는 막혀있지 않고, 대신 "문제 풀기 준비 중" 안내만 붙는다.
test('the profession picker lets you choose any of the 50 jobs, with an honest "exam not ready" note on the 48 without real exam content', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '직업 변경' }).click()

  const dialog = page.getByRole('dialog', { name: '직업 선택' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('IT·개발')).toBeVisible()
  await expect(dialog.getByText('헬스케어')).toBeVisible()

  // 시험 콘텐츠가 없는 직업(개발자)도 비활성화되지 않고, "문제 풀기
  // 준비 중" 안내만 붙은 채로 클릭할 수 있다 — 고르면 실제로 바뀐다.
  const developerButton = dialog.getByRole('button', { name: '개발자 문제 풀기 준비 중', exact: true })
  await expect(developerButton).toBeEnabled()
  await expect(developerButton.getByText('문제 풀기 준비 중')).toBeVisible()
  await developerButton.click()
  await expect(page.getByText('직업을 변경할까요?')).toBeVisible()
  await expect(page.getByText('개발자', { exact: false })).toBeVisible()
})

// PR #51(직업 선택 제한 해제): 시험 문제은행이 없는 직업(개발자)을
// 고르면 "문제 풀기" 메뉴 버튼만 비활성화되고(나머지 메뉴는 그대로
// 쓸 수 있음), HUD의 직업 배지에는 고른 직업명이 그대로 보인다.
test('a profession without exam content disables only the quiz button, while the HUD still shows the chosen job', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, profession: 'developer' }] })

  await page.goto('/grow')

  await expect(page.getByTestId('profession-badge')).toHaveText(/개발자/)
  const quizButton = page.getByRole('button', { name: /문제 풀기/ })
  await expect(quizButton).toBeDisabled()
  await expect(page.getByRole('button', { name: '가르치기' })).toBeEnabled()
})

// PR #49 요청 3: 텍스트 입력 폼이 바로 뜨지 않고, 짧은 "턴 진행" 연출이
// 먼저 나온다 — InteractionPanel 내부 로직은 그대로다.
test('choosing 가르치기 shows a brief turn transition before the teach panel opens', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '가르치기' }).click()

  await expect(page.getByTestId('turn-transition')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
})

// PR #49 요청 1: 소품(책상/마이크 등)도 클릭 가능한 인터랙션 — 눌러보면
// 짧은 반응이 온다.
// PR #50 긴급 재작업: 메인 화면 기본(로비) 배경이 CSS 그라디언트 방이
// 아니라 제공받은 실제 일러스트 이미지 파일로 뜨는지 직접 검증한다 —
// "파란 동그라미 캐릭터가 사라지고 실제 일러스트가 떠야 한다"는 요청을
// 코드가 아니라 테스트로도 못박아 둔다.
test('the default stage shows the real illustrated image, not a CSS-drawn room with the circle SVG character', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')

  await expect(page.getByTestId('illustrated-scene-background')).toBeVisible()
  // 일러스트 모드에서는 손그림 SVG 캐릭터가 아예 렌더링되지 않는다 —
  // role=img는 여전히 있지만(접근성 계약 유지), <svg>가 아니라 탭
  // 가능한 영역(div)이어야 한다.
  const characterRegion = page.getByRole('img', { name: /누리 캐릭터/ })
  await expect(characterRegion).toBeVisible()
  await expect(page.locator('svg.grow-sprite-pose-idle')).toHaveCount(0)
})

// PR #50 긴급 재작업: 기본(로비) 배경은 이제 제공받은 실제 일러스트라
// 소품 자체가 없다(그림 안에 이미 다 그려져 있음) — 소품 클릭 인터랙션은
// 전용 아트가 없는 마켓 구매 배경(사무실 등 CSS 기반 8곳)에서만
// 유효하다. 그래서 먼저 사무실 배경을 구매·장착한 뒤 그 소품을 누른다.
test('clicking a scene prop gives a short reaction, in a purchased CSS-based background (offices etc. have no illustrated art yet)', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '아이템 마켓' }).click()
  const dialog = page.getByRole('dialog', { name: '아이템 마켓' })
  await dialog.getByRole('button', { name: '배경', exact: true }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '구매하기' }).click()
  await dialog.getByText('사무실').locator('..').getByRole('button', { name: '장착하기' }).click()
  await page.getByRole('button', { name: '닫기' }).click()

  // 소품은 계속 흔들리는 CSS 애니메이션이 있어(grow-prop-sway) Playwright의
  // "안정될 때까지 대기" 체크가 끝나지 않는다 — 실제 사용자는 흔들리는
  // 이모지도 문제없이 탭할 수 있으므로 force로 그 체크만 건너뛴다.
  await page.getByRole('button', { name: '소품 💻 살펴보기' }).click({ force: true })

  await expect(page.getByTestId('speech-bubble')).toContainText('💻')
})

// PR #50: 커스터마이징 룸/아이템 마켓은 직업 선택과 무관하게 항상 열 수
// 있다(가르치기 등 나머지 6개와 다르게 alwaysEnabled).
test('the customization room and item market are always available, even without a profession selected', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [{ ...NURI_SINGER, profession: null }] })

  await page.goto('/grow')

  await expect(page.getByRole('button', { name: '가르치기' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '커스터마이징' })).toBeEnabled()

  await page.getByRole('button', { name: '커스터마이징' }).click()
  await expect(page.getByRole('dialog', { name: '커스터마이징 룸' })).toBeVisible()
})

// PR #50: 아이템 마켓 구매 흐름 — 모의 골드로 옷을 사면 골드가 깎이고
// 보유 상태로 바뀌며, 그 자리에서 바로 장착할 수 있다.
test('buying an outfit in the item market deducts gold and lets you equip it', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')
  await page.getByRole('button', { name: '아이템 마켓' }).click()

  const dialog = page.getByRole('dialog', { name: '아이템 마켓' })
  await expect(dialog.getByTestId('market-gold')).toHaveText('300')

  // 누리 옷 탭에는 기본 의상(무료, 이미 보유·장착 중)과 한복 블라우스
  // (150골드, 미보유) 둘뿐이라 "구매하기" 버튼은 하나로 unambiguous하다.
  await dialog.getByRole('button', { name: '구매하기' }).click()
  await expect(dialog.getByTestId('market-gold')).toHaveText('150')

  await dialog.getByRole('button', { name: '장착하기' }).click()
  await expect(dialog.getByText('장착 중')).toBeVisible()
})

// PR #54 요청 2번: 기본 로비는 누리·두리가 함께 그려진 고정 일러스트라
// "복잡하다"는 피드백을 받아, PR #53에서는 안 보고 있는 쪽 절반만
// 어둡게 가렸었다 — 그런데 그 방식은 안 보고 있는 쪽 화면이 여전히
// 선명하게 남아 있어 "여러 일러스트/두리 화면이 중복으로 겹쳐 보인다"는
// 버그로 이어졌다. 이제는 양쪽 다 똑같이 어둡게 가라앉혀 배경 전체가
// 순수 분위기(ambient)로만 쓰이고, 화면에서 분명하게 보이는 캐릭터
// 그림은 중앙의 초상화 카드 하나뿐임을 검증한다.
test('the whole shared illustration (both companions) is dimmed into ambiance, so only the centered portrait card reads as "the character"', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')

  await expect(page.getByTestId('illustrated-scene-background')).toBeVisible()
  const dimOverlay = page.getByTestId('illustrated-ambient-dim')
  await expect(dimOverlay).toBeVisible()
  const box = await dimOverlay.boundingBox()
  const frame = await page.getByTestId('illustrated-scene-background').boundingBox()
  // 더 이상 반쪽만이 아니라 프레임 전체를 덮어야 한다(두리 쪽 화면이
  // 따로 선명하게 남아있지 않다는 뜻).
  expect(box.width).toBeGreaterThanOrEqual(frame.width - 1)
  expect(box.height).toBeGreaterThanOrEqual(frame.height - 1)

  // 초상화 카드는 정중앙에, 눈에 띄게 크게 떠야 한다.
  const portrait = page.getByTestId('illustrated-age-portrait-nuri')
  await expect(portrait).toBeVisible()
  const portraitBox = await portrait.boundingBox()
  const frameCenterX = frame.x + frame.width / 2
  expect(portraitBox.x + portraitBox.width / 2).toBeGreaterThan(frameCenterX - 20)
  expect(portraitBox.x + portraitBox.width / 2).toBeLessThan(frameCenterX + 20)
})

// PR #53 요청 5번: 커스터마이징 룸의 파란 도형 SVG 프리뷰를 실제
// 연령대별 캐릭터 이미지로 교체했다(기본 의상일 때만 — 한복처럼 그림에
// 색이 반영되는 옷을 입었을 때는 옷 갈아입히기 미리보기를 지키기 위해
// 계속 SVG를 쓴다).
test('the customization room shows the real character portrait instead of the SVG shape, for the default outfit', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] }) // level: 1 → toddler

  await page.goto('/grow')
  await page.getByRole('button', { name: '커스터마이징' }).click()

  const portrait = page.getByTestId('customization-age-portrait')
  await expect(portrait).toBeVisible()
  await expect(portrait).toHaveAttribute('src', /nuri-toddler/)
  await expect(page.locator('svg.grow-sprite-pose-idle')).toHaveCount(0)
})

// PR #53 요청 1번: PC 화면에서 중앙에 좁게 모인 "모바일 프레임" 레이아웃을
// 해제하고 브라우저 가로폭에 맞춰 넓게 확장한다 — 기존 max-w-xl(576px)
// 캡이 더 이상 데스크톱 너비를 그대로 좁히지 않는지 확인한다.
test('the grow page uses a fluid full-width layout on a wide desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')

  const container = page.getByTestId('grow-page-container')
  const box = await container.boundingBox()
  // 기존 max-w-xl 캡(576px)이면 콘텐츠 폭이 그보다 좁았다 — 이제는
  // 사이드바를 뺀 나머지 폭을 거의 다 쓰므로 훨씬 넓어야 한다.
  expect(box.width).toBeGreaterThan(900)
})

// PR #54 요청 3번: 하단에 빽빽하던 액션 버튼들을 PC(lg+)에서는 스테이지
// 오른쪽 사이드 패널로 옮긴다 — 버튼이 스테이지 "아래"가 아니라
// "옆"(오른쪽, 같은 높이대)에 있는지 좌표로 확인한다.
test('on a wide desktop viewport, the action menu moves beside the stage into a side panel instead of a bottom grid', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')

  const stageBox = await page.getByTestId('illustrated-scene-background').boundingBox()
  const teachButton = page.getByRole('button', { name: '가르치기' })
  await expect(teachButton).toBeVisible()
  const menuBox = await teachButton.boundingBox()

  // 메뉴가 스테이지 오른쪽에 있어야 한다(아래가 아니라).
  expect(menuBox.x).toBeGreaterThanOrEqual(stageBox.x + stageBox.width - 1)
  // 메뉴 버튼이 스테이지와 거의 같은 높이대에서 시작해야 한다(한참 아래로
  // 밀려 내려간 하단 그리드가 아니라는 뜻).
  expect(menuBox.y).toBeLessThan(stageBox.y + stageBox.height)
})

// 모바일 폭에서는 PR #53까지와 동일하게 메뉴가 스테이지 "아래"에 그대로
// 쌓여야 한다 — 사이드 패널 변경이 모바일 레이아웃을 건드리지 않았는지
// 확인한다.
test('on a mobile viewport, the action menu still stacks below the stage as a grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await mockEmptyConversations(page)
  await mockCharacterApi(page, { characters: [NURI_SINGER] })

  await page.goto('/grow')

  const stageBox = await page.getByTestId('illustrated-scene-background').boundingBox()
  const teachButton = page.getByRole('button', { name: '가르치기' })
  await expect(teachButton).toBeVisible()
  const menuBox = await teachButton.boundingBox()

  expect(menuBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 1)
})
