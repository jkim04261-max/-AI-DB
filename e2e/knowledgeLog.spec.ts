import { test, expect, type Page, type Route } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockEmptyCharacters } from './fixtures/mock-api'

// 지시서(실제 업무·연구·비법·노하우 기록 시스템) 전용 e2e — "지식
// 기록장"(/knowledge-log) 화면. e2e/attachments.spec.ts의 기존 범위
// 경계와 같은 이유로, 실제 Vercel Blob 업로드 왕복(PUT)은 여기서도
// 거치지 않는다 — 파일 선택 시점의 클라이언트 검증(허용 타입/용량)과
// 첨부 없이 저장하는 흐름만 e2e로 확인하고, "첨부와 함께 저장"은
// tests/knowledgeLog.test.cjs(API 레벨)가 이미 덮는다.
const USER = { id: 1, email: 'alice@test.com' }

function mockEmptyConversations(page: Page) {
  return page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
  })
}

interface KnowledgeLogEntry {
  id: number
  entryDate: string
  businessName: string | null
  category: string
  tags: string | null
  content: string
  visibility: string
  attachments: { url: string; mimeType: string | null; name: string | null }[]
}

async function mockKnowledgeLogApi(
  page: Page,
  options: {
    initialEntries?: KnowledgeLogEntry[]
    onSave?: (route: Route) => Promise<void>
    onDelete?: (route: Route) => Promise<void>
  } = {},
) {
  let nextId = (options.initialEntries?.reduce((max, e) => Math.max(max, e.id), 0) ?? 0) + 1
  const entries = [...(options.initialEntries ?? [])]

  await page.route('**/api/character**', async (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const method = route.request().method()

    if (method === 'GET' && action === 'knowledge-log') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries }) })
      return
    }
    if (method === 'POST' && action === 'knowledge-log-save') {
      if (options.onSave) {
        await options.onSave(route)
        return
      }
      const body = route.request().postDataJSON() as Partial<KnowledgeLogEntry> & { id?: number }
      const entry: KnowledgeLogEntry = {
        id: body.id ?? nextId++,
        entryDate: body.entryDate ?? '2026-11-19',
        businessName: body.businessName ?? null,
        category: body.category ?? 'work_log',
        tags: body.tags ?? null,
        content: body.content ?? '',
        visibility: body.visibility ?? 'private',
        attachments: body.attachments ?? [],
      }
      const existingIndex = entries.findIndex((e) => e.id === entry.id)
      if (existingIndex >= 0) entries[existingIndex] = entry
      else entries.unshift(entry)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entry }) })
      return
    }
    if (method === 'POST' && action === 'knowledge-log-delete') {
      if (options.onDelete) {
        await options.onDelete(route)
        return
      }
      const body = route.request().postDataJSON() as { id?: number }
      const idx = entries.findIndex((e) => e.id === body.id)
      if (idx >= 0) entries.splice(idx, 1)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    await route.fallback()
  })
}

test.describe('지식 기록장', () => {
  test('빈 상태에서 기록을 작성해 저장하면 목록에 나타나고, 저작권 경고 문구가 항상 보인다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')

    await expect(page.getByText('아직 기록한 지식이 없어요.')).toBeVisible()
    await expect(page.getByText(/회사 기밀, 타인 개인정보, 제3자 저작물은 권한 없이 등록·공유할 수 없습니다/)).toBeVisible()

    await page.getByTestId('knowledge-log-category-success_case').click()
    await page.getByTestId('knowledge-log-content-textarea').fill('신규 거래처와 계약을 성공적으로 체결했다.')
    await page.getByTestId('knowledge-log-save-button').click()

    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(1)
    await expect(page.getByTestId('knowledge-log-entry')).toContainText('신규 거래처와 계약을 성공적으로 체결했다.')
    await expect(page.getByTestId('knowledge-log-entry')).toContainText('성공사례')
    // 저장 후 입력 폼은 비워진다.
    await expect(page.getByTestId('knowledge-log-content-textarea')).toHaveValue('')
  })

  test('개인정보로 의심되는 내용을 저장하려 하면 경고 팝업이 뜨고, 취소하면 저장되지 않는다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')
    await page.getByTestId('knowledge-log-content-textarea').fill('고객 전화번호는 010-1234-5678이고 메모해두었다.')
    await page.getByTestId('knowledge-log-save-button').click()

    await expect(page.getByTestId('sensitive-content-warning')).toBeVisible()
    await page.getByRole('button', { name: '다시 확인할게요' }).click()
    await expect(page.getByTestId('sensitive-content-warning')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(0)
  })

  test('경고 팝업에서 "그대로 저장"을 누르면 실제로 저장된다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')
    await page.getByTestId('knowledge-log-content-textarea').fill('이메일 문의는 alice@example.com으로 받았다.')
    await page.getByTestId('knowledge-log-save-button').click()
    await expect(page.getByTestId('sensitive-content-warning')).toBeVisible()
    await page.getByTestId('sensitive-content-confirm-save').click()

    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(1)
    await expect(page.getByTestId('knowledge-log-entry')).toContainText('alice@example.com')
  })

  test('실행 파일(.exe)을 첨부하려 하면 거부되고 썸네일이 추가되지 않는다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('not an image') },
    ])

    // 에러 메시지 자체가 파일명을 포함하므로("virus.exe: ... 첨부할 수
    // 없어요"), "첨부 제거" 버튼(첨부 칩에만 있다)이 없다는 사실로
    // 썸네일/칩이 추가되지 않았음을 확인한다.
    await expect(page.getByText(/사진\(PNG\/JPEG\/WEBP\/GIF\) 또는 동영상\(MP4\/WEBM\/MOV\)만 첨부할 수 있어요/)).toBeVisible()
    await expect(page.getByRole('button', { name: '첨부 제거' })).toHaveCount(0)
  })

  test('5MB를 넘는 사진은 거부된다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) },
    ])

    await expect(page.getByText(/사진은 5MB 이하만 첨부할 수 있어요/)).toBeVisible()
  })

  test('허용된 사진 한 장은 미리보기 칩으로 보이고 제거할 수 있다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/knowledge-log')
    await page.locator('input[type="file"]').setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.alloc(1024, 1) }])

    await expect(page.getByText('photo.png')).toBeVisible()
    await page.getByRole('button', { name: '첨부 제거' }).click()
    await expect(page.getByText('photo.png')).toHaveCount(0)
  })

  test('기록을 수정하면 새로 추가되지 않고 같은 항목이 바뀐다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page, {
      initialEntries: [
        {
          id: 7,
          entryDate: '2026-11-18',
          businessName: null,
          category: 'work_log',
          tags: null,
          content: '원래 내용',
          visibility: 'private',
          attachments: [],
        },
      ],
    })

    await page.goto('/knowledge-log')
    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(1)

    await page.getByRole('button', { name: '수정' }).click()
    await expect(page.getByTestId('knowledge-log-content-textarea')).toHaveValue('원래 내용')
    await page.getByTestId('knowledge-log-content-textarea').fill('수정한 내용')
    await page.getByTestId('knowledge-log-save-button').click()

    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(1)
    await expect(page.getByTestId('knowledge-log-entry')).toContainText('수정한 내용')
  })

  test('기록을 삭제하면 목록에서 사라진다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page, {
      initialEntries: [
        {
          id: 9,
          entryDate: '2026-11-18',
          businessName: null,
          category: 'tip',
          tags: null,
          content: '삭제될 기록',
          visibility: 'private',
          attachments: [],
        },
      ],
    })

    page.once('dialog', (dialog) => dialog.accept())
    await page.goto('/knowledge-log')
    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(1)
    await page.getByRole('button', { name: '삭제' }).click()

    await expect(page.getByTestId('knowledge-log-entry')).toHaveCount(0)
    await expect(page.getByText('아직 기록한 지식이 없어요.')).toBeVisible()
  })

  test('마이페이지에서 지식 기록장으로 이동할 수 있다', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: USER })
    await mockEmptyConversations(page)
    await mockEmptyCharacters(page)
    await mockKnowledgeLogApi(page)

    await page.goto('/mypage')
    await page.getByRole('button', { name: /지식 기록장/ }).click()
    await page.waitForURL('**/knowledge-log')
    await expect(page.getByRole('heading', { name: '지식 기록장' })).toBeVisible()
  })
})
