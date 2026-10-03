import { expect, test } from 'claude-code/testing'

const HOUR = 3_600_000
const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never

test('turn usage fills the band on terminal and desktop', async ($, on) => {
  const now = Date.parse('2026-10-03T10:00:00Z')
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['plan bar below'] }) as never)
  on('clock.now', () => ({ value: now }))
  on('session.usage', () => ({
    value: {
    startedAt: now,
    context: { window: 200000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(now + 160 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 58, resetsAt: new Date(now + 31 * HOUR).toISOString() },
    ],
    cost: { usd: 4.32 },
    },
  }))
  on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }))

  await $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { model: 'm', input_tokens: 15600, output_tokens: 3000, cache_read_input_tokens: 900000, cache_creation_input_tokens: 54200 },
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props })
    const hit = await ui.find({ type: surface === 'terminal' ? 'Text' : 'Svg' })
    expect(hit).toBeDefined()
  }
})

test('band still draws with no rate limits, tokens or cost', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['plan bar below'] }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-03T10:00:00Z') }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ type: surface === 'terminal' ? 'Text' : 'Svg' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'plan bar below' })).toBeDefined()
  }
})
