/**
 * Wisecrack full-game multi-user E2E — anonymous play on the Party Pack hub.
 *
 * A Stage + 3 phones (each its own browser context → its own cid, no sign-in)
 * play a complete 3-round game to the podium. The hub twist vs the original
 * wisecrack2 spec: rooms are born unbound — the FIRST JOIN carries `?g=wisecrack`
 * to bind the room to the engine; later joiners need no param (the broadcast
 * state carries `game`). A second test covers exactly that dispatch surface:
 * unbound room + no `?g=` → "Room not found", bound room + no `?g=` → joins fine.
 *
 * A polling driver acts whenever actionable UI appears and waits through the
 * timed reveal/score phases; it also snapshots the Stage per phase into docs/shots.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
function roomCode(): string {
  let c = ''
  for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return c
}
async function device(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext()
  return ctx.newPage()
}

test('full 3-round anonymous game reaches the podium (room bound via ?g=wisecrack)', async ({ browser }) => {
  test.setTimeout(240_000)
  const room = roomCode()
  const stage = await device(browser)
  const phones = await Promise.all([device(browser), device(browser), device(browser)])
  const names = ['Ack', 'Boo', 'Cal']

  // The Stage never JOINs; ?g= lets it render the Wisecrack lobby pre-bind.
  await stage.goto(`/stage/${room}?g=wisecrack`)
  await expect(stage.getByTestId('stage-code')).toHaveText(room, { timeout: 15_000 })

  // Phone 1's JOIN (first in) binds the fresh room to wisecrack.
  for (let i = 0; i < 3; i++) {
    await phones[i].goto(`/play/${room}?g=wisecrack`)
    await phones[i].getByTestId('name-input').fill(names[i])
    await phones[i].getByTestId('join-game-btn').click()
    await expect(phones[i].getByTestId('lobby-joined')).toBeVisible({ timeout: 15_000 })
  }
  await phones[0].getByTestId('start-btn').click()
  await expect(stage.getByTestId('stage-playing')).toBeVisible({ timeout: 15_000 })

  const shot = new Set<string>()
  let podium = false
  for (let n = 0; n < 220 && !podium; n++) {
    for (let i = 0; i < 3; i++) {
      const pg = phones[i]
      const inputs = pg.getByTestId('answer-input')
      const ic = await inputs.count()
      for (let j = 0; j < ic; j++) {
        try { await inputs.nth(j).fill(`${names[i]} ${n}-${j}`, { timeout: 1000 }) } catch { /* re-render */ }
      }
      let subs = await pg.getByTestId('submit-answer').count()
      let guard = 0
      while (subs > 0 && guard++ < 4) {
        try { await pg.getByTestId('submit-answer').first().click({ timeout: 1000 }) } catch { /* */ }
        const after = await pg.getByTestId('submit-answer').count()
        if (after >= subs) break
        subs = after
      }
      if ((await pg.getByTestId('vote-option').count()) > 0) {
        try { await pg.getByTestId('vote-option').first().click({ timeout: 1000 }) } catch { /* */ }
      }
      let adds = await pg.getByTestId('final-vote-add').count()
      let g2 = 0
      while (adds > 0 && g2++ < 4) {
        try { await pg.getByTestId('final-vote-add').first().click({ timeout: 600 }) } catch { /* */ }
        adds = await pg.getByTestId('final-vote-add').count()
      }
    }

    const phase = await stage.getByTestId('stage-playing').getAttribute('data-phase').catch(() => null)
    if (phase && !shot.has(phase)) {
      shot.add(phase)
      await stage.screenshot({ path: `docs/shots/pp-stage-${phase}.png` }).catch(() => {})
      // Also snapshot a PHONE for the phases that must be self-contained for
      // online (no-TV) play — the reveal/score must show real content there.
      if (['REVEAL', 'SCORE', 'FINAL_REVEAL'].includes(phase)) {
        await phones[1].screenshot({ path: `docs/shots/pp-phone-${phase}.png` }).catch(() => {})
      }
    }
    if ((await stage.getByTestId('stage-podium').count()) > 0) podium = true
    else await stage.waitForTimeout(700)
  }

  await stage.screenshot({ path: 'docs/shots/pp-stage-PODIUM.png' }).catch(() => {})
  await phones[1].screenshot({ path: 'docs/shots/pp-phone-PODIUM.png' }).catch(() => {})
  expect(podium, 'game should reach the podium').toBe(true)
  await expect(stage.getByTestId('stage-podium')).toBeVisible()
  // The phone podium must stand on its own (online play): winner + standings.
  await expect(phones[1].getByText(/wins|You win/)).toBeVisible({ timeout: 15_000 })
  // Host controls at the podium (recap viewer page lands in a later phase).
  await expect(phones[0].getByTestId('play-again-btn')).toBeVisible({ timeout: 15_000 })

  for (const p of [stage, ...phones]) await p.context().close()
})

test('room binding dispatch: unbound + no ?g= → not found; bound → joiner needs no param', async ({ browser }) => {
  test.setTimeout(90_000)
  const room = roomCode()

  // 1. Unbound room, no ?g= → the pre-state broadcasts { game: null } → not found.
  const probe = await device(browser)
  await probe.goto(`/play/${room}`)
  await expect(probe.getByTestId('room-not-found')).toBeVisible({ timeout: 15_000 })
  await expect(probe.getByTestId('go-home')).toBeVisible()

  // Stage on the same unbound room (never JOINs) without ?g= → also not found.
  const tv = await device(browser)
  await tv.goto(`/stage/${room}`)
  await expect(tv.getByTestId('room-not-found')).toBeVisible({ timeout: 15_000 })

  // 2. A host arrives WITH ?g=wisecrack — their JOIN binds the room.
  const host = await device(browser)
  await host.goto(`/play/${room}?g=wisecrack`)
  await host.getByTestId('name-input').fill('Hoot')
  await host.getByTestId('join-game-btn').click()
  await expect(host.getByTestId('lobby-joined')).toBeVisible({ timeout: 15_000 })

  // 3. A joiner with NO ?g= now lands in the Wisecrack name screen (broadcast
  //    carries state.game) and can seat themselves.
  const joiner = await device(browser)
  await joiner.goto(`/play/${room}`)
  await joiner.getByTestId('name-input').fill('Jeer', { timeout: 15_000 })
  await joiner.getByTestId('join-game-btn').click()
  await expect(joiner.getByTestId('lobby-joined')).toBeVisible({ timeout: 15_000 })

  // 4. The Stage with no ?g= now renders the bound game's lobby marquee.
  await tv.goto(`/stage/${room}`)
  await expect(tv.getByTestId('stage-code')).toHaveText(room, { timeout: 15_000 })

  for (const p of [probe, tv, host, joiner]) await p.context().close()
})
