import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/** Wait for the React app shell to mount (landing and game routes alike). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByRole('heading', { name: /party pack/i })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('three game posters render with join + host affordances', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    for (const id of ['wisecrack', 'baloney', 'pitch']) {
      await expect(page.getByTestId(`poster-${id}`)).toBeVisible()
      await expect(page.getByTestId(`host-${id}`)).toBeVisible()
      // Per-poster online/solo affordances (design-system v2 landing).
      await expect(page.getByTestId(`quick-play-${id}`)).toBeVisible()
      await expect(page.getByTestId(`solo-${id}`)).toBeVisible()
      await expect(page.getByTestId(`room-filter-${id}`)).toBeVisible()
    }
    await expect(page.getByTestId('poster-wisecrack')).toContainText('Wisecrack')
    await expect(page.getByTestId('poster-baloney')).toContainText('Baloney')
    await expect(page.getByTestId('poster-pitch')).toContainText('Pitch')

    // The JOIN strip — the page's single most important action.
    await expect(page.getByTestId('join-code-input')).toBeVisible()
    await expect(page.getByTestId('join-btn')).toBeVisible()

    // Open-rooms zone renders (empty state is fine on a fresh DB).
    await expect(page.getByTestId('open-rooms')).toBeVisible()
    await expect(page.getByTestId('quick-play-btn')).toBeVisible()
  })

  test('play solo mints a bots room URL', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.getByTestId('solo-wisecrack').click()
    await expect(page).toHaveURL(/\/play\/[A-Z]{4}\?g=wisecrack&bots=1$/)
  })

  test('join strip rejects junk codes without navigating', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.getByTestId('join-code-input').fill('A1')
    await page.getByTestId('join-btn').click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText(/room codes are 4 letters/i)).toBeVisible()
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})
