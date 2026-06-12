/**
 * Baloney full-game multi-user E2E — anonymous play on the Party Pack hub.
 *
 * A Stage + 3 phones (each its own browser context → its own cid, no sign-in)
 * play a complete 2-round game to the podium. Phone 1's JOIN carries
 * `?g=baloney` to bind the fresh room to the engine (the hub pattern); later
 * joiners need no param. The host plays (writes a lie + votes) and also drives
 * Start + the rounds picker from their phone.
 *
 * A polling driver acts whenever actionable UI appears (lie input → submit,
 * ballot cards → tap) and waits through the timed reveal/score phases, tracking
 * that a lie locked in, the vote board appeared, and the reveal played. It also
 * snapshots the Stage per phase into docs/shots.
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

test('full 2-round anonymous game reaches the podium (room bound via ?g=baloney)', async ({ browser }) => {
  test.setTimeout(240_000)
  const room = roomCode()
  const stage = await device(browser)
  const phones = await Promise.all([device(browser), device(browser), device(browser)])
  const names = ['Ack', 'Boo', 'Cal']

  // The Stage never JOINs; ?g= lets it render the Baloney lobby pre-bind.
  await stage.goto(`/stage/${room}?g=baloney`)
  await expect(stage.getByTestId('stage-code')).toHaveText(room, { timeout: 15_000 })

  // Phone 1's JOIN (first in) binds the fresh room to baloney and becomes host.
  for (let i = 0; i < 3; i++) {
    await phones[i].goto(`/play/${room}?g=baloney`)
    await phones[i].getByTestId('name-input').fill(names[i])
    await phones[i].getByTestId('join-game-btn').click()
    await expect(phones[i].getByTestId('lobby-joined')).toBeVisible({ timeout: 15_000 })
  }

  // Host trims the show to 2 rounds, then starts.
  await phones[0].getByTestId('rounds-2').click()
  await phones[0].getByTestId('start-btn').click()
  await expect(stage.getByTestId('stage-playing')).toBeVisible({ timeout: 15_000 })

  const shot = new Set<string>()
  let sawLieLocked = false
  let sawVoteBoard = false
  let sawReveal = false
  let podium = false
  for (let n = 0; n < 220 && !podium; n++) {
    for (let i = 0; i < 3; i++) {
      const pg = phones[i]
      // WRITE: the bounded lie card — fill a distinct fib and send it.
      if ((await pg.getByTestId('lie-input').count()) > 0) {
        try {
          await pg.getByTestId('lie-input').fill(`${names[i]} fib ${n}`, { timeout: 1000 })
          await pg.getByTestId('submit-lie').click({ timeout: 1000 })
          // Observe the lock on the FIRST submitter, synchronously after its
          // submit: the phase can't early-advance while the others are still
          // writing, so the locked card is guaranteed to render here. Checking
          // on the next poll iteration instead is a race — the last lie
          // advances WRITE→VOTE between polls and the locked state vanishes.
          if (!sawLieLocked) {
            sawLieLocked = await pg
              .getByTestId('lie-locked')
              .waitFor({ state: 'visible', timeout: 5000 })
              .then(() => true)
              .catch(() => false)
          }
        } catch { /* re-render race */ }
      }
      if (!sawLieLocked && (await pg.getByTestId('lie-locked').count()) > 0) sawLieLocked = true
      // VOTE: the ballot cards ARE the tap targets (own lie never listed).
      const ballots = await pg.getByTestId('vote-option').count()
      if (ballots > 0) {
        sawVoteBoard = true
        try { await pg.getByTestId('vote-option').first().click({ timeout: 1000 }) } catch { /* */ }
      }
    }

    const phase = await stage.getByTestId('stage-playing').getAttribute('data-phase').catch(() => null)
    if (phase === 'REVEAL') sawReveal = true
    if (phase && !shot.has(phase)) {
      shot.add(phase)
      await stage.screenshot({ path: `docs/shots/pp-baloney-stage-${phase}.png` }).catch(() => {})
      // Also snapshot a PHONE for the phases that must be self-contained for
      // online (no-TV) play — the reveal/score must show real content there.
      if (['REVEAL', 'SCORE'].includes(phase)) {
        await phones[1].screenshot({ path: `docs/shots/pp-baloney-phone-${phase}.png` }).catch(() => {})
      }
    }
    if ((await stage.getByText(/wins with/).count()) > 0) podium = true
    else await stage.waitForTimeout(700)
  }

  await stage.screenshot({ path: 'docs/shots/pp-baloney-stage-PODIUM.png' }).catch(() => {})
  await phones[1].screenshot({ path: 'docs/shots/pp-baloney-phone-PODIUM.png' }).catch(() => {})

  expect(sawLieLocked, 'a submitted lie should lock in on the controller').toBe(true)
  expect(sawVoteBoard, 'the vote board should offer ballot cards on the phones').toBe(true)
  expect(sawReveal, 'the staged reveal should play on the Stage').toBe(true)
  expect(podium, 'game should reach the podium').toBe(true)
  await expect(stage.getByText(/wins with/)).toBeVisible()
  // The phone podium must stand on its own (online play): winner + standings.
  await expect(phones[1].getByText(/wins|You win/)).toBeVisible({ timeout: 15_000 })
  // Host controls at the podium.
  await expect(phones[0].getByTestId('play-again-btn')).toBeVisible({ timeout: 15_000 })

  for (const p of [stage, ...phones]) await p.context().close()
})
