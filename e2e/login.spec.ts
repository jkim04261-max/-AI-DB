import { test, expect } from '@playwright/test'
import { failUnmockedApiCalls, mockMe, mockLogin } from './fixtures/mock-api'

// Every scenario here is mocked — no real /api/auth/* call reaches a
// network, Postgres, or AUTH_SECRET. See e2e/README.md.
test.describe('login', () => {
  test('renders the login form', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })

    await page.goto('/login')

    await expect(page.getByPlaceholder('이메일')).toBeVisible()
    await expect(page.getByPlaceholder('비밀번호')).toBeVisible()
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
    await expect(page.getByText('비밀번호를 잊으셨나요?')).toBeVisible()
  })

  test('shows a server-provided error on invalid credentials, without navigating away', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })
    await mockLogin(page, { status: 401, body: { error: '이메일 또는 비밀번호가 올바르지 않아요.' } })

    await page.goto('/login')
    await page.getByPlaceholder('이메일').fill('nobody@test.com')
    await page.getByPlaceholder('비밀번호').fill('wrong-password')
    await page.getByRole('button', { name: '로그인' }).click()

    await expect(page.getByText('이메일 또는 비밀번호가 올바르지 않아요.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('navigates to home after a successful login', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })
    await mockLogin(page, { status: 200, body: { user: { id: 1, email: 'alice@test.com' } } })
    // AuthContext re-fetches /me right after a successful login to pick
    // up daily-limit fields — the second call must also succeed.
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 1, email: 'alice@test.com' } }),
      })
    })
    // ChatProvider fetches the conversation list as soon as `user` is set,
    // immediately after a successful login — must be mocked too.
    await page.route('**/api/conversations', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) })
    })

    await page.goto('/login')
    await page.getByPlaceholder('이메일').fill('alice@test.com')
    await page.getByPlaceholder('비밀번호').fill('correct-password')
    await page.getByRole('button', { name: '로그인' }).click()

    await expect(page).toHaveURL('/')
  })

  test('the browser blocks submit when the email field is empty (native required validation)', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })

    await page.goto('/login')
    await page.getByPlaceholder('비밀번호').fill('something12')
    await page.getByRole('button', { name: '로그인' }).click()

    // No login request should have been attempted — still on /login.
    await expect(page).toHaveURL(/\/login$/)
    const isValid = await page.getByPlaceholder('이메일').evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(isValid).toBe(false)
  })
})

test.describe('signup', () => {
  test('requires both agreement checkboxes before the submit button is enabled', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })

    await page.goto('/signup')
    const submit = page.getByRole('button', { name: '회원가입' })
    await expect(submit).toBeDisabled()

    await page.locator('label').filter({ hasText: '이용약관' }).getByRole('checkbox').check()
    await expect(submit).toBeDisabled()

    await page.locator('label').filter({ hasText: '개인정보처리방침' }).getByRole('checkbox').check()
    await expect(submit).toBeEnabled()
  })

  test('rejects a mismatched password confirmation client-side, without calling the API', async ({ page }) => {
    await failUnmockedApiCalls(page)
    await mockMe(page, { user: null })

    await page.goto('/signup')
    await page.getByPlaceholder('이메일').fill('new@test.com')
    await page.getByPlaceholder('비밀번호 (8자 이상)').fill('longenough1')
    await page.getByPlaceholder('비밀번호 확인').fill('different1')
    await page.locator('label').filter({ hasText: '이용약관' }).getByRole('checkbox').check()
    await page.locator('label').filter({ hasText: '개인정보처리방침' }).getByRole('checkbox').check()
    await page.getByRole('button', { name: '회원가입' }).click()

    await expect(page.getByText('비밀번호가 일치하지 않아요.')).toBeVisible()
  })
})
