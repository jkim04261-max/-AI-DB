import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, openChat } from './fixtures/mock-api'

// Pure attach/preview/remove UI — selecting files and rendering their
// preview thumbnails happens entirely client-side (URL.createObjectURL),
// so none of these need an upload to complete. None of these tests click
// "send", so the actual Vercel Blob upload protocol is never exercised —
// see e2e/README.md for that scope boundary.

const USER = { id: 1, email: 'alice@test.com' }

function fakeImage(name: string, sizeBytes = 1024) {
  return { name, mimeType: 'image/png', buffer: Buffer.alloc(sizeBytes, 1) }
}

function fakePdf(name: string, sizeBytes = 1024) {
  return { name, mimeType: 'application/pdf', buffer: Buffer.alloc(sizeBytes, 1) }
}

async function openChatWithEmptyConversation(page: import('@playwright/test').Page, id: number) {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: USER })
  await page.route('**/api/conversations', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [{ id, title: 'attach test', updated_at: new Date().toISOString() }] }) })
  })
  await page.route(`**/api/conversations/${id}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversation: { id, title: 'attach test', messages: [] } }) })
      return
    }
    await route.fallback()
  })
  await openChat(page, id)
}

test.describe('attachments', () => {
  test('attaching 1 image shows a preview thumbnail and a 1/10 counter', async ({ page }) => {
    await openChatWithEmptyConversation(page, 10)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('one.png')])

    await expect(page.getByAltText('one.png')).toBeVisible()
    await expect(page.getByText('(1/10)')).toBeVisible()
  })

  test('attaching 11 images at once keeps only 10 and shows a limit message', async ({ page }) => {
    await openChatWithEmptyConversation(page, 11)

    const files = Array.from({ length: 11 }, (_, i) => fakeImage(`img${i}.png`))
    await page.locator('input[type="file"]').setInputFiles(files)

    await expect(page.getByText('(10/10)')).toBeVisible()
    await expect(page.getByText(/최대 10장까지만 첨부/)).toBeVisible()
  })

  test('removing an attachment drops its preview and frees a slot', async ({ page }) => {
    await openChatWithEmptyConversation(page, 12)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('keep.png'), fakeImage('remove.png')])
    await expect(page.getByText('(2/10)')).toBeVisible()

    await page.getByRole('button', { name: 'remove.png 제거' }).click()

    await expect(page.getByAltText('remove.png')).toHaveCount(0)
    await expect(page.getByAltText('keep.png')).toBeVisible()
    await expect(page.getByText('(1/10)')).toBeVisible()
  })

  test('a disallowed file type is rejected with an error message, no thumbnail added', async ({ page }) => {
    await openChatWithEmptyConversation(page, 13)

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not an image or pdf') },
    ])

    await expect(page.getByText(/PNG, JPEG, WEBP, GIF 이미지 또는 PDF 파일만/)).toBeVisible()
    await expect(page.locator('img[alt="clip.mp4"]')).toHaveCount(0)
  })

  test('a file over 8MB is rejected with an error message', async ({ page }) => {
    await openChatWithEmptyConversation(page, 14)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('huge.png', 9 * 1024 * 1024)])

    await expect(page.getByText(/MB 이하만 첨부할 수 있어요/)).toBeVisible()
    await expect(page.getByAltText('huge.png')).toHaveCount(0)
  })

  // 지시서(첨부 파일 확장): PDF는 이미지와 달리 썸네일을 만들 수 없어
  // 아이콘 + 파일명 칩으로 보여준다(ChatInput.tsx의 role="img" 분기).
  test('attaching a PDF shows a file-chip preview (not a broken image) and counts toward the limit', async ({ page }) => {
    await openChatWithEmptyConversation(page, 15)

    await page.locator('input[type="file"]').setInputFiles([fakePdf('report.pdf')])

    await expect(page.getByRole('img', { name: 'report.pdf' })).toBeVisible()
    await expect(page.getByText('report.pdf')).toBeVisible()
    await expect(page.getByText('(1/10)')).toBeVisible()
    await expect(page.locator('img[alt="report.pdf"]')).toHaveCount(0)
  })

  test('mixing images and a PDF in one message works, and removing the PDF frees its slot', async ({ page }) => {
    await openChatWithEmptyConversation(page, 16)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('photo.png'), fakePdf('doc.pdf')])
    await expect(page.getByAltText('photo.png')).toBeVisible()
    await expect(page.getByRole('img', { name: 'doc.pdf' })).toBeVisible()
    await expect(page.getByText('(2/10)')).toBeVisible()

    await page.getByRole('button', { name: 'doc.pdf 제거' }).click()

    await expect(page.getByRole('img', { name: 'doc.pdf' })).toHaveCount(0)
    await expect(page.getByAltText('photo.png')).toBeVisible()
    await expect(page.getByText('(1/10)')).toBeVisible()
  })
})
