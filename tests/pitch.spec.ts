/**
 * Pitch full-game multi-user E2E — anonymous play on the Party Pack hub.
 *
 * A Stage + 3 phones (each its own browser context → its own cid, no sign-in)
 * play a complete 2-round game to the podium. Same hub model as the wisecrack
 * spec: rooms are born unbound — the FIRST JOIN carries `?g=pitch` to bind the
 * room to the engine; later joiners need no param (the broadcast state carries
 * `game`). The host plays (first joiner): they set rounds, start, invent, and
 * vote like everyone else.
 *
 * A polling driver acts whenever actionable UI appears (the two-field
 * invention card, the ballot cards) and waits through the timed brief/reveal/
 * score phases; it also snapshots the Stage per phase into docs/shots.
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

test('full 2-round anonymous game reaches the podium (room bound via ?g=pitch)', async ({ browser }) => {
  test.setTimeout(240_000)
  const room = roomCode()
  const stage = await device(browser)
  const phones = await Promise.all([device(browser), device(browser), device(browser)])
  const names = ['Ada', 'Bix', 'Cyd']

  // The Stage never JOINs; ?g= lets it render the Pitch lobby pre-bind.
  await stage.goto(`/stage/${room}?g=pitch`)
  await expect(stage.getByTestId('stage-code')).toHaveText(room, { timeout: 15_000 })

  // Phone 1's JOIN (first in) binds the fresh room to pitch — and seats the host.
  for (let i = 0; i < 3; i++) {
    await phones[i].goto(`/play/${room}?g=pitch`)
    await phones[i].getByTestId('name-input').fill(names[i])
    await phones[i].getByTestId('join-game-btn').click()
    await expect(phones[i].getByTestId('lobby-joined')).toBeVisible({ timeout: 15_000 })
  }

  // Host (phone 1) trims the game to 2 rounds, then starts.
  await phones[0].getByTestId('rounds-2').click()
  await phones[0].getByTestId('start-btn').click()
  await expect(stage.getByTestId('stage-playing')).toBeVisible({ timeout: 15_000 })

  const shot = new Set<string>()
  let sawVoteBoard = false
  let podium = false
  for (let n = 0; n < 220 && !podium; n++) {
    for (let i = 0; i < 3; i++) {
      const pg = phones[i]
      // WRITE: the bounded invention card — name field + pitch beneath, one submit.
      if ((await pg.getByTestId('invention-name-input').count()) > 0) {
        try {
          await pg.getByTestId('invention-name-input').fill(`${names[i]}Co ${n}`, { timeout: 1000 })
          await pg.getByTestId('invention-pitch-input').fill(`The only ${names[i]} you need. Round ${n}.`, { timeout: 1000 })
          await pg.getByTestId('submit-invention').click({ timeout: 1000 })
        } catch { /* phase moved on mid-fill */ }
      }
      // VOTE: ballot cards are the tap targets (own card never shown).
      if ((await pg.getByTestId('vote-option').count()) > 0) {
        try { await pg.getByTestId('vote-option').first().click({ timeout: 1000 }) } catch { /* */ }
      }
    }

    const phase = await stage.getByTestId('stage-playing').getAttribute('data-phase').catch(() => null)
    if (phase === 'VOTE' && (await stage.getByTestId('stage-option').count()) > 0) {
      sawVoteBoard = true // the invention board rendered big on the TV
    }
    if (phase && !shot.has(phase)) {
      shot.add(phase)
      await stage.screenshot({ path: `docs/shots/pp-pitch-stage-${phase}.png` }).catch(() => {})
      // Also snapshot a PHONE for the phases that must be self-contained for
      // online (no-TV) play — the reveal/score must show real content there.
      if (['REVEAL', 'SCORE'].includes(phase)) {
        await phones[1].screenshot({ path: `docs/shots/pp-pitch-phone-${phase}.png` }).catch(() => {})
      }
    }
    if ((await stage.getByText(/wins with/).count()) > 0) podium = true
    else await stage.waitForTimeout(700)
  }

  await stage.screenshot({ path: 'docs/shots/pp-pitch-stage-PODIUM.png' }).catch(() => {})
  await phones[1].screenshot({ path: 'docs/shots/pp-pitch-phone-PODIUM.png' }).catch(() => {})

  expect(podium, 'game should reach the podium').toBe(true)
  expect(sawVoteBoard, 'the stage should show the invention vote board').toBe(true)
  expect(shot.has('VOTE'), 'the game should pass through VOTE').toBe(true)
  expect(shot.has('REVEAL'), 'the game should pass through REVEAL').toBe(true)
  await expect(stage.getByText(/wins with/)).toBeVisible()
  // The phone podium must stand on its own (online play): winner + standings.
  await expect(phones[1].getByText(/wins|You win/)).toBeVisible({ timeout: 15_000 })
  // Host controls at the podium (the host is a player — phone 1).
  await expect(phones[0].getByTestId('play-again-btn')).toBeVisible({ timeout: 15_000 })

  for (const p of [stage, ...phones]) await p.context().close()
})
