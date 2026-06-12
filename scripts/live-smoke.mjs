// Live production smoke: hosts each game at partypack.app.space with 2 browsers
// + 1 AI bot and verifies the round advances past WRITE (proves the prod LLM
// bot path). Run: node scripts/live-smoke.mjs (bills a few owner-paid cents).
import { chromium } from '@playwright/test'

const BASE = 'https://partypack.app.space'
const CODES = { wisecrack: 'P' , baloney: 'P', pitch: 'P' } // codes generated below
const rand = () => Array.from({length:4}, () => 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(Math.random()*23)]).join('')

const SUBMIT = {
  wisecrack: async (pg, tag) => {
    const inp = pg.getByTestId('answer-input')
    if (await inp.count()) { try { await inp.first().fill(`live ${tag}`, {timeout:800}); await pg.getByTestId('submit-answer').first().click({timeout:800}) } catch {} }
  },
  baloney: async (pg, tag) => {
    const inp = pg.getByTestId('lie-input')
    if (await inp.count()) { try { await inp.fill(`live ${tag}`, {timeout:800}); await pg.getByTestId('submit-lie').click({timeout:800}) } catch {} }
  },
  pitch: async (pg, tag) => {
    const n = pg.getByTestId('invention-name-input')
    if (await n.count()) { try { await n.fill(`Zib${tag}`, {timeout:800}); await pg.getByTestId('invention-pitch-input').fill(`live pitch ${tag}`, {timeout:800}); await pg.getByTestId('submit-invention').click({timeout:800}) } catch {} }
  },
}

const b = await chromium.launch()
for (const game of ['wisecrack', 'baloney', 'pitch']) {
  const code = rand()
  const ctxs = [await b.newContext(), await b.newContext()]
  const pgs = []
  for (let i = 0; i < 2; i++) {
    const p = await ctxs[i].newPage()
    await p.goto(`${BASE}/play/${code}?g=${game}`)
    await p.getByTestId('name-input').fill(i === 0 ? 'Hosty' : 'Guest')
    await p.getByTestId('join-game-btn').click()
    await p.getByTestId('lobby-joined').waitFor({ timeout: 20000 })
    pgs.push(p)
  }
  // host seats one AI bot (proves the prod owner-billed LLM path)
  const fill = pgs[0].getByTestId('fill-bots-btn')
  if (await fill.count()) await fill.click()
  else await pgs[0].getByTestId('add-bot-btn').click()
  await pgs[0].waitForTimeout(1500)
  await pgs[0].getByTestId('start-btn').click()

  // drive until the round advances past WRITE (bot must answer too)
  let advanced = false
  for (let n = 0; n < 90 && !advanced; n++) {
    for (const pg of pgs) await SUBMIT[game](pg, `${n}`)
    const votes = (await pgs[0].getByTestId('vote-option').count()) + (await pgs[1].getByTestId('vote-option').count())
    const reveal = await pgs[0].getByText(/truth|votes are in|reveal/i).count()
    if (votes > 0 || reveal > 0) advanced = true
    else await pgs[0].waitForTimeout(1000)
  }
  console.log(`${game} ${code}: ${advanced ? 'OK — round advanced past WRITE with a live bot' : 'FAILED to advance'}`)
  for (const c of ctxs) await c.close()
  if (!advanced) process.exitCode = 1
}
await b.close()
