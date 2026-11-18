import { expect, test } from '@playwright/test'
import { failUnmockedApiCalls, mockEmptyCharacters, mockMe } from './fixtures/mock-api'

test('마이페이지에서 직업 프로필을 저장하고 새로고침 후 확인한다', async ({ page }) => {
  await failUnmockedApiCalls(page)
  await mockMe(page, { user: { id: 1, email: 'profile@example.com' } })
  await mockEmptyCharacters(page)
  await page.route('**/api/conversations', (route) => route.fulfill({ json: { conversations: [] } }))

  let profile = { workplace: '', industry: '', careerStartDate: '', workplaceVisibility: 'private' }
  let failNextSave = true
  await page.route('**/api/account/work-profile', async (route) => {
    if (route.request().method() === 'PUT') {
      if (failNextSave) {
        failNextSave = false
        return route.fulfill({ status: 500, json: { error: 'mock failure' } })
      }
      profile = route.request().postDataJSON()
    }
    await route.fulfill({ json: { profile } })
  })

  await page.goto('/mypage')
  const section = page.getByRole('region', { name: '직업 프로필' })
  const workplace = section.getByLabel('직장·상호명', { exact: true })
  const visibility = section.getByLabel('직장·상호명 공개 범위')
  const save = section.getByRole('button', { name: '직업 프로필 저장' })
  await expect(visibility).toHaveValue('private')
  await workplace.fill('누리상점')
  await section.getByLabel('업종').fill('교육')
  await section.getByLabel('경력 시작일').fill('2024-02-29')
  await visibility.selectOption('public')
  await save.click()
  await expect(section.getByRole('alert')).toContainText('저장하지 못했어요')
  await expect(workplace).toHaveValue('누리상점')
  await save.click()
  await expect(section.getByRole('status')).toContainText('저장했어요')

  await page.reload()
  await expect(workplace).toHaveValue('누리상점')
  await expect(section.getByLabel('업종')).toHaveValue('교육')
  await expect(section.getByLabel('경력 시작일')).toHaveValue('2024-02-29')
  await expect(visibility).toHaveValue('public')
})
