/**
 * Visual proof for the no-scroll landing: screenshots at five viewports plus
 * a mocked-full open-rooms shot, asserting zero page scroll at each.
 *
 *   node scripts/landing-noscroll-proof.mjs   (vite must be on :5281)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5281'
const OUT = 'docs/design/proof/landing-noscroll'
const SIZES = [
  ['1440x900', 1440, 900],
  ['1366x768', 1366, 768],
  ['1280x720', 1280, 720],
  ['390x844', 390, 844],
  ['360x740', 360, 740],
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let failed = false

/** Wait until the staggered deal-in animation has fully landed the posters. */
async function settleDeal(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="poster-pitch"]')
    return el && getComputedStyle(el).opacity === '1'
  })
  await page.waitForTimeout(400)
}

async function assertNoScroll(page, label) {
  const m = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    scrollW: document.documentElement.scrollWidth,
    innerH: window.innerHeight,
    innerW: window.innerWidth,
  }))
  const okV = m.scrollH <= m.innerH + 1
  const okH = m.scrollW <= m.innerW + 1
  console.log(
    `${label}: scrollHeight=${m.scrollH} innerHeight=${m.innerH} ${okV ? 'OK' : 'FAIL'} | scrollWidth=${m.scrollW} innerWidth=${m.innerW} ${okH ? 'OK' : 'FAIL'}`,
  )
  if (!okV || !okH) failed = true
}

for (const [label, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="open-rooms"]')
  await settleDeal(page)
  await assertNoScroll(page, label)
  await page.screenshot({ path: `${OUT}/${label}.png` })
  await page.close()
}

// Mocked-full rooms list (5 rows) to prove the internal-scroll cap. React owns
// the empty-state node, so swap the card body via DOM after render.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(BASE)
  await page.waitForSelector('[data-testid="open-rooms"]')
  await settleDeal(page)
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="open-rooms"] > div')
    const empty = card.querySelector('p')
    const games = [
      ['Wisecrack', '#c6ff3d', 'Maya', '5/8'],
      ['Baloney', '#ff2e97', 'Jordan', '3/8'],
      ['Pitch', '#ff8a3d', 'Sam', '6/8'],
      ['Wisecrack', '#c6ff3d', 'Priya', '2/8'],
      ['Baloney', '#ff2e97', 'Alex', '4/8'],
    ]
    const list = document.createElement('div')
    list.className = 'max-h-[8.25rem] divide-y divide-[#131313]/10 overflow-y-auto overscroll-contain'
    list.innerHTML = games
      .map(
        ([g, hex, name, count]) => `
        <div class="flex items-center gap-3 py-1.5">
          <span class="h-3 w-3 shrink-0 rounded-full border border-[#131313]/30" style="background-color:${hex}"></span>
          <span class="font-display text-sm uppercase text-[#131313]">${g}</span>
          <span class="min-w-0 flex-1 truncate font-body text-sm font-semibold text-[#131313]/70">${name}'s room</span>
          <span class="font-display text-sm text-[#131313]/60 tabular-nums">${count}</span>
          <button class="whitespace-nowrap rounded-xl border-2 border-[#131313]/30 px-3 py-1.5 font-body text-xs font-bold text-[#131313] md:py-2 md:text-sm">Join</button>
        </div>`,
      )
      .join('')
    empty.replaceWith(list)
  })
  await page.waitForTimeout(200)
  await assertNoScroll(page, '1280x720-rooms-full')
  await page.screenshot({ path: `${OUT}/1280x720-rooms-full.png` })
  await page.close()
}

await browser.close()
if (failed) {
  console.error('SCROLL ASSERTIONS FAILED')
  process.exit(1)
}
console.log('All scroll assertions passed.')
