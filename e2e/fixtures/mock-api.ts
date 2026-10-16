import type { Page } from '@playwright/test'

export interface MeResponse {
  user: { id: number; email: string } | null
  dailyQuestionLimit?: number
  remainingQuestions?: number | null
}

// Must be called before any more specific `page.route()` calls in the same
// test — Playwright matches routes most-recently-registered first, so
// registering this broad catch-all *first* makes it the fallback: a real
// network call only reaches it if nothing more specific below handled the
// request first. That turns "we forgot to mock an endpoint" into a loud
// test failure instead of a silent real (and possibly costly/DB-touching)
// network call.
export async function failUnmockedApiCalls(page: Page) {
  await page.route('**/api/**', async (route) => {
    throw new Error(`Unmocked API call reached this handler: ${route.request().method()} ${route.request().url()}`)
  })
}

export async function mockMe(page: Page, body: MeResponse) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

// ChatPage redirects to /chat (`<Navigate to="/chat" replace />`) whenever
// `getChat(id)` doesn't find the conversation yet — which is always true on
// the very first render, since ChatProvider's conversation-list fetch is
// still in flight. A direct `page.goto('/chat/:id')` therefore loses that
// race deterministically and never reaches the chat UI. Real users don't
// hit this because they arrive via an in-app click, by which point the
// list is already loaded, so this helper reproduces that same real path:
// load the list first, then navigate in via the actual link.
export async function openChat(page: Page, id: number | string) {
  await page.goto('/chat')
  const link = page.locator(`a[href="/chat/${id}"]`)
  await link.waitFor()
  await link.click()
  await page.waitForURL(`**/chat/${id}`)
}

export async function mockLogin(
  page: Page,
  result: { status: number; body: Record<string, unknown> },
) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) })
  })
}
