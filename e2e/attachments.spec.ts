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
  test('attaching 1 image shows a preview thumbnail and a 1/5 counter', async ({ page }) => {
    await openChatWithEmptyConversation(page, 10)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('one.png')])

    await expect(page.getByAltText('one.png')).toBeVisible()
    await expect(page.getByText('(1/5)')).toBeVisible()
  })

  test('attaching 6 images at once keeps only 5 and shows a limit message', async ({ page }) => {
    await openChatWithEmptyConversation(page, 11)

    const files = Array.from({ length: 6 }, (_, i) => fakeImage(`img${i}.png`))
    await page.locator('input[type="file"]').setInputFiles(files)

    await expect(page.getByText('(5/5)')).toBeVisible()
    await expect(page.getByText(/최대 5장까지만 첨부/)).toBeVisible()
  })

  test('removing an attachment drops its preview and frees a slot', async ({ page }) => {
    await openChatWithEmptyConversation(page, 12)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('keep.png'), fakeImage('remove.png')])
    await expect(page.getByText('(2/5)')).toBeVisible()

    await page.getByRole('button', { name: 'remove.png 제거' }).click()

    await expect(page.getByAltText('remove.png')).toHaveCount(0)
    await expect(page.getByAltText('keep.png')).toBeVisible()
    await expect(page.getByText('(1/5)')).toBeVisible()
  })

  test('a disallowed file type is rejected with an error message, no thumbnail added', async ({ page }) => {
    await openChatWithEmptyConversation(page, 13)

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not an image') },
    ])

    await expect(page.getByText(/PNG, JPEG, WEBP, GIF 이미지만/)).toBeVisible()
    await expect(page.locator('img[alt="doc.pdf"]')).toHaveCount(0)
  })

  test('a file over 8MB is rejected with an error message', async ({ page }) => {
    await openChatWithEmptyConversation(page, 14)

    await page.locator('input[type="file"]').setInputFiles([fakeImage('huge.png', 9 * 1024 * 1024)])

    await expect(page.getByText(/MB 이하만 첨부할 수 있어요/)).toBeVisible()
    await expect(page.getByAltText('huge.png')).toHaveCount(0)
  })
})
