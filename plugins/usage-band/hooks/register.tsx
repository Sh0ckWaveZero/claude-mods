import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Tokens } from '../types'

const tokens = atom({ plugin: 'usage-band', key: 'tokens' } as const, {
  input: 0,
  output: 0,
  cache: 0,
} as Tokens)
const tick = atom({ plugin: 'usage-band', key: 'tick' } as const, 0)
const isOpen = atom({ plugin: 'usage-band', key: 'isOpen' } as const, true)

const HOUR = 3_600_000
const WINDOWS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 168 * HOUR }

type Palette = { fill: string; ink: string; bar: string }

const LIGHT = {
  green: { fill: '#2f8f6f26', ink: '#2f7d62', bar: '#7fae6a' },
  purple: { fill: '#7c5cd62e', ink: '#6a4bc4', bar: '#7fae6a' },
  red: { fill: '#d6513a2e', ink: '#c0432d', bar: '#d6513a' },
  blue: { fill: '#4a5fd62e', ink: '#3f51c7', bar: '#4a5fd6' },
  gold: { fill: '#c9a0332e', ink: '#a07d12', bar: '#c9a033' },
}
// same hues on a dark band: lighter ink so text keeps its contrast
const DARK = {
  green: { fill: '#4cc79a2e', ink: '#6fd9b0', bar: '#7fae6a' },
  purple: { fill: '#9b82f03a', ink: '#b8a4ff', bar: '#7fae6a' },
  red: { fill: '#f0705a3a', ink: '#ff9a86', bar: '#f0705a' },
  blue: { fill: '#7b8cf53a', ink: '#a5b2ff', bar: '#7b8cf5' },
  gold: { fill: '#e6c05a33', ink: '#f0cf72', bar: '#e6c05a' },
}
// the theme is read once at session start; an unknown theme keeps the light look
let isDark = false
const palettes = () => (isDark ? DARK : LIGHT)
// marker and track must show on both backgrounds
const trackColor = () => (isDark ? '#ffffff2e' : '#00000022')
const markerColor = () => (isDark ? '#e8e8e8' : '#3a3a3a')
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"
const CHAR_W = 7.9
const PILL_H = 24

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

const countdown = (ms: number) => {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// 16x16 stroke icons, drawn at (x, 4)
const ICONS: Record<string, string> = {
  gauge: '<path d="M2 12a6 6 0 1 1 12 0" /><path d="M8 12l3-4" />',
  clock: '<path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8L2.4 6" /><path d="M2.4 2.6V6h3.4" /><path d="M8 5v3.2l2.1 1.3" />',
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 7h11M5.5 2v3M10.5 2v3" /><path d="M6.4 9.2h3.2L7.9 12" stroke-width="1.2" />',
  up: '<path d="M2 10v2.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V10" /><path d="M8 10V2M4.8 5.2L8 2l3.2 3.2" />',
  down: '<path d="M2 10v2.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V10" /><path d="M8 2v8M4.8 6.8L8 10l3.2-3.2" />',
  layers: '<path d="M8 1.8L14.2 5 8 8.2 1.8 5z" /><path d="M1.8 8L8 11.2 14.2 8" /><path d="M1.8 11L8 14.2 14.2 11" />',
  dollar: '<circle cx="8" cy="8" r="6" /><path d="M8 3.8v8.4" /><path d="M10 6.1C10 5.3 9.1 4.9 8 4.9S6 5.4 6 6.2 6.9 7.5 8 7.9s2 .9 2 1.8-.9 1.4-2 1.4-2-.4-2-1.2" />',
}

const icon = (name: string, x: number, color: string) =>
  `<g transform="translate(${x} 4)" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`

const text = (s: string, x: number, color: string, bold = false) =>
  `<text x="${x}" y="16.5" fill="${color}" font-family="${MONO}" font-size="13" ${bold ? 'font-weight="700"' : ''}>${esc(s)}</text>`

type Piece = { width: number; svg: (x: number) => string }

const bar = (pct: number, elapsed: number | null, p: Palette): Piece => ({
  width: 96,
  svg: x => {
    const w = 94
    const fill = Math.max(2, (Math.min(100, pct) / 100) * w)
    const marker = elapsed === null ? '' : `<rect x="${x + elapsed * w - 1}" y="3.5" width="2" height="17" rx="1" fill="${markerColor()}" />`
    return (
      `<rect x="${x}" y="9" width="${w}" height="6" rx="3" fill="${trackColor()}" />` +
      `<rect x="${x}" y="9" width="${fill}" height="6" rx="3" fill="${p.bar}" />${marker}`
    )
  },
})

const label = (s: string, color: string, bold = false): Piece => ({
  width: s.length * CHAR_W,
  svg: x => text(s, x, color, bold),
})

const glyph = (name: string, color: string): Piece => ({ width: 16, svg: x => icon(name, x, color) })

const divider = (color: string): Piece => ({
  width: 1,
  svg: x => `<rect x="${x}" y="5" width="1" height="14" fill="${color}" opacity="0.35" />`,
})

// lay pieces out inside one rounded pill; returns the pill's width and markup at x0
const pill = (pieces: Piece[], p: Palette, x0: number) => {
  const padX = 12
  const gap = 8
  let x = x0 + padX
  let body = ''
  for (const piece of pieces) {
    body += piece.svg(x)
    x += piece.width + gap
  }
  const width = x - gap + padX - x0
  const shape = `<rect x="${x0}" y="0" width="${width}" height="${PILL_H}" rx="12" fill="${p.fill}" />`
  return { width, svg: shape + body }
}

const limitPill = (limit: SessionRateLimit | undefined, name: string, short: string, p: Palette, now: number) => {
  const windowMs = limit ? WINDOWS[limit.kind] : undefined
  const remaining = limit?.resetsAt ? Date.parse(limit.resetsAt) - now : null
  const elapsed = remaining !== null && windowMs ? Math.min(1, Math.max(0, 1 - remaining / windowMs)) : null
  const percent = limit ? `${Math.round(limit.percentUsed)}%` : '--%'

  return [
    glyph(name, p.ink),
    label(short, p.ink),
    bar(limit?.percentUsed ?? 0, elapsed, p),
    label(percent.padStart(3), p.ink, true),
    divider(p.ink),
    glyph('clock', p.ink),
    label(remaining !== null ? countdown(remaining) : '--', p.ink),
  ]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')
    isDark = /dark/i.test(String(theme?.value ?? ''))
    $.clock.every(60_000, () => update($, tick, n => n + 1))
    await $.command.register({ name: 'usage-band', description: 'Show or hide the usage band' })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage

    if (u) {
      await update($, tokens, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cache: t.cache + u.cache_read_input_tokens + u.cache_creation_input_tokens,
      }))
    }
    await update($, tick, n => n + 1)

    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async $ => {
    const open = await read($, isOpen)
    await update($, isOpen, () => !open)

    return { text: open ? 'Usage band hidden.' : 'Usage band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)

    // other mods draw in this band too (plan-progress); keep what sits beneath us and stack it under ours
    const below = await next(e)

    const [total, usage, now] = await Promise.all([read($, tokens), $.session.usage(), $.clock.now()])
    await read($, tick)

    const five = usage.rateLimits.find(l => l.kind === 'five_hour')
    const seven = usage.rateLimits.find(l => l.kind === 'seven_day')
    const cost = `$${(usage.cost?.usd ?? 0).toFixed(2)}`

    const { Box, Text } = $.ui.resolve(e)

    if (e.surface === 'terminal') {
      const parts = [
        `5h ${five ? `${Math.round(five.percentUsed)}%` : '--%'}`,
        `7d ${seven ? `${Math.round(seven.percentUsed)}%` : '--%'}`,
        `↑${compact(total.input)} ↓${compact(total.output)} ⛁${compact(total.cache)}`,
        cost,
      ]

      return (
        <Box flexDirection="column">
          <Text dimColor>{parts.join('  ')}</Text>
          {below}
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e) as { Svg: (props: Record<string, unknown>) => unknown }

    const pills: { width: number; svg: (x: number) => string }[] = []
    const widths: number[] = []
    const add = (pieces: Piece[], p: Palette) => {
      pills.push({ width: 0, svg: x => pill(pieces, p, x).svg })
      widths.push(pill(pieces, p, 0).width)
    }

    const { green, purple, red, blue, gold } = palettes()
    add(limitPill(five, 'gauge', '5h', green, now), green)
    add(limitPill(seven, 'calendar', '7d', purple, now), purple)
    add([glyph('up', red.ink), label(compact(total.input), red.ink)], red)
    add([glyph('down', green.ink), label(compact(total.output), green.ink)], green)
    add([glyph('layers', blue.ink), label(compact(total.cache), blue.ink)], blue)
    add([glyph('dollar', gold.ink), label(cost, gold.ink)], gold)

    const gap = 10
    let x = 0
    let body = ''
    pills.forEach((entry, i) => {
      body += entry.svg(x)
      x += widths[i] + gap
    })
    const width = Math.max(1, Math.ceil(x - gap))

    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_H}" viewBox="0 0 ${width} ${PILL_H}">${body}</svg>`
    const alt = `5h ${five?.percentUsed ?? '--'}%, 7d ${seven?.percentUsed ?? '--'}%, ${cost}`

    return (
      <Box flexDirection="column" gap={1}>
        <Box paddingX={1}>
          <Svg source={source} alt={`Usage: ${alt}`} height={PILL_H} />
        </Box>
        {below}
      </Box>
    )
  })
}
