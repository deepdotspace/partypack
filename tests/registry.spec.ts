/**
 * Public-rooms registry lifecycle — the abandoned-lobby regression.
 *
 * The reported bug: open a public room via "Play online", leave, refresh the
 * landing, and the dead room is STILL listed (the SDK halts the game tick on the
 * last disconnect, so the registry delete never ran). This spec hosts a public
 * lobby, confirms it lists, then leaves and asserts it delists promptly — both
 * via the live reactive query AND a hard refresh (the exact thing the user did).
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
function roomCode(): string {
  let c = ''
  for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return c
}
async function ctxPage(browser: Browser, w: number, h: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  return ctx.newPage()
}

test('abandoned public lobby delists on leave (and stays gone after refresh)', async ({ browser }) => {
  test.setTimeout(90_000)
  const code = roomCode()
  // Unique host name so we can find exactly this room and not collide with rooms
  // left over from other runs.
  const host = `H${code}`
  const roomLabel = `${host}'s room`

  // 1) Host opens a fresh PUBLIC room and joins → the lobby registers a row.
  const hostPage = await ctxPage(browser, 390, 844)
  await hostPage.goto(`/play/${code}?g=wisecrack&public=1`)
  await hostPage.getByTestId('name-input').fill(host)
  await hostPage.getByTestId('join-game-btn').click()
  await hostPage.getByTestId('lobby-joined').waitFor({ timeout: 15_000 })

  // 2) A separate visitor on the landing should see the public room appear.
  const landing = await ctxPage(browser, 1280, 800)
  await landing.goto('/')
  const openRooms = landing.getByTestId('open-rooms')
  await expect(openRooms.getByText(roomLabel)).toBeVisible({ timeout: 20_000 })

  // 3) The host abandons the lobby (closes the tab → websocket closes).
  await hostPage.context().close()

  // 4) The row must delist promptly on the live query (onPlayerLeave delete).
  await expect(openRooms.getByText(roomLabel)).toHaveCount(0, { timeout: 20_000 })

  // 5) And — the user's exact action — a hard refresh must NOT bring it back.
  await landing.reload()
  await landing.getByTestId('open-rooms').waitFor({ timeout: 15_000 })
  await expect(landing.getByTestId('open-rooms').getByText(roomLabel)).toHaveCount(0)

  await landing.context().close()
})
