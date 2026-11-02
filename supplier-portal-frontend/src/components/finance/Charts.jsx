import { useEffect, useRef, useState } from 'react'
import { CHART_COLORS as SERIES, compactMoney, formatMoney, monthLabel } from '../../utils/finance'

const INK = { primary: '#0b1f3a', secondary: '#52607a', muted: '#8a94a6' }

// The element's width, kept up to date (a fixed fallback where ResizeObserver does not exist, e.g. tests).
function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
      {items.map(([name, color]) => <li key={name} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />{name}</li>)}
    </ul>
  )
}

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-[#d8e0e9] bg-white px-2.5 py-1.5 text-[11px] shadow-[0_8px_24px_rgba(11,55,104,0.14)]" style={{ left: tip.x, top: tip.y - 6 }}>
      <p className="mb-0.5 font-bold text-navy-950">{tip.title}</p>
      {tip.rows.map(([name, value, color]) => (
        <p key={name} className="flex items-center justify-between gap-3 text-slate-600">
          <span className="inline-flex items-center gap-1.5">{color && <i className="size-2 rounded-sm" style={{ background: color }} />}{name}</span>
          <b className="font-semibold tabular-nums text-navy-950">{value}</b>
        </p>
      ))}
    </div>
  )
}

// Loan utilisation: one bar per facility, utilised then available, on a track to the sanctioned limit.
export function UtilisationChart({ facilities }) {
  const [tip, setTip] = useState(null)
  if (!facilities.length) return <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">No approved facility yet.</p>
  return (
    <div className="relative">
      <Legend items={[['Utilised', SERIES.utilised], ['Available to draw', SERIES.available], ['Rest of sanctioned limit', SERIES.track]]} />
      <ul className="mt-2 grid gap-2.5" aria-label="Loan utilisation by facility">
        {facilities.map((f) => {
          const scale = Math.max(f.sanctionedAmount || 0, (f.utilised || 0) + (f.available || 0)) || 1
          const used = ((f.utilised || 0) / scale) * 100
          const free = ((f.available || 0) / scale) * 100
          const show = (e) => {
            const box = e.currentTarget.closest('.relative').getBoundingClientRect()
            const at = e.currentTarget.getBoundingClientRect()
            setTip({ x: at.left - box.left + at.width / 2, y: at.top - box.top, title: `Sanction ${f.sanctionNo}`, rows: [
              ['Sanctioned', formatMoney(f.sanctionedAmount, f.currency)], ['Utilised', formatMoney(f.utilised, f.currency), SERIES.utilised],
              ['Available', formatMoney(f.available, f.currency), SERIES.available]] })
          }
          return (
            <li key={f.id} className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span className="text-[12px] font-bold text-navy-900">Sanction {f.sanctionNo}</span>
              <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-[#e5eaf1]" onMouseEnter={show} onMouseLeave={() => setTip(null)} onFocus={show} onBlur={() => setTip(null)} tabIndex={0}
                aria-label={`Sanction ${f.sanctionNo}: utilised ${formatMoney(f.utilised, f.currency)}, available ${formatMoney(f.available, f.currency)} of ${formatMoney(f.sanctionedAmount, f.currency)}`}>
                {used > 0 && <i className="h-full rounded-l" style={{ width: `${used}%`, background: SERIES.utilised }} />}
                {free > 0 && <i className="h-full" style={{ width: `${free}%`, background: SERIES.available }} />}
              </div>
              <span className="text-[11px] tabular-nums text-slate-600"><b className="text-navy-950">{compactMoney(f.utilised)}</b> used · <b className="text-navy-950">{compactMoney(f.available)}</b> free of {compactMoney(f.sanctionedAmount)}</span>
            </li>
          )
        })}
      </ul>
      <Tooltip tip={tip} />
    </div>
  )
}

// Y-axis ticks: 0 and three round steps above the largest value.
function ticksFor(max) {
  if (max <= 0) return [0]
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  return [0, step, step * 2, step * 3]
}

// Monthly inflow vs outflow (posted money only): two bars per month on one ₹ axis, with net in the tooltip.
export function MonthlyChart({ monthly, height = 180 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const months = monthly.slice(-12)
  if (!months.length) return <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">No posted money movements yet.</p>
  const pad = { l: 52, r: 8, t: 8, b: 22 }
  const ticks = ticksFor(Math.max(...months.flatMap((m) => [m.inflow, m.outflow])))
  const top = ticks.at(-1) || 1
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b
  const band = plotW / months.length
  const barW = Math.min(18, Math.max(4, (band - 10) / 2))
  const y = (v) => pad.t + plotH - (v / top) * plotH
  const bar = (x, v, color) => {
    const h = Math.max(0, plotH - (y(v) - pad.t))
    if (h <= 0) return null
    const r = Math.min(4, barW / 2, h)
    const yy = y(v)
    return <path d={`M${x},${pad.t + plotH} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${pad.t + plotH} Z`} fill={color} />
  }
  const m = hover !== null ? months[hover] : null
  return (
    <div className="relative" ref={ref}>
      <Legend items={[['Inflow (disbursed to you)', SERIES.inflow], ['Outflow (your payments)', SERIES.outflow]]} />
      <svg width={width} height={height} className="mt-1 block" role="img" aria-label="Monthly inflow and outflow">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c2cdda' : SERIES.grid} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={INK.muted}>{compactMoney(t)}</text>
          </g>
        ))}
        {months.map((mo, i) => {
          const x0 = pad.l + i * band + (band - (barW * 2 + 2)) / 2
          return (
            <g key={mo.month}>
              {hover === i && <rect x={pad.l + i * band} y={pad.t} width={band} height={plotH} fill="#eef2fb" opacity="0.6" />}
              {bar(x0, mo.inflow, SERIES.inflow)}
              {bar(x0 + barW + 2, mo.outflow, SERIES.outflow)}
              <text x={pad.l + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize="10" fill={INK.secondary}>{monthLabel(mo.month)}</text>
              <rect x={pad.l + i * band} y={pad.t} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          )
        })}
      </svg>
      {m && <Tooltip tip={{ x: pad.l + hover * band + band / 2, y: pad.t + 10, title: monthLabel(m.month), rows: [['Inflow', formatMoney(m.inflow), SERIES.inflow], ['Outflow', formatMoney(m.outflow), SERIES.outflow], ['Net', formatMoney(m.net)]] }} />}
    </div>
  )
}

// Net cashflow by month: one 2px line with markers on one axis that always includes zero.
export function NetTrendChart({ monthly, height = 150 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const months = monthly.slice(-12)
  if (months.length < 2) return <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">A trend shows once there are two months of posted movements.</p>
  const pad = { l: 52, r: 12, t: 10, b: 22 }
  const values = months.map((m) => m.net)
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values)
  const span = hi - lo || 1
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b
  const x = (i) => pad.l + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW)
  const y = (v) => pad.t + ((hi - v) / span) * plotH
  const points = months.map((m, i) => `${x(i)},${y(m.net)}`).join(' ')
  const m = hover !== null ? months[hover] : null
  return (
    <div className="relative" ref={ref}>
      <svg width={width} height={height} className="block" role="img" aria-label="Net cashflow by month">
        {[hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c2cdda' : SERIES.grid} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={INK.muted}>{compactMoney(t)}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} stroke="#c2cdda" strokeDasharray="3 3" />}
        <polyline points={points} fill="none" stroke={SERIES.inflow} strokeWidth="2" strokeLinejoin="round" />
        {months.map((mo, i) => (
          <g key={mo.month}>
            <circle cx={x(i)} cy={y(mo.net)} r={hover === i ? 5 : 4} fill={SERIES.inflow} stroke="#fff" strokeWidth="2" />
            <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill={INK.secondary}>{monthLabel(mo.month)}</text>
            <rect x={x(i) - plotW / months.length / 2} y={pad.t} width={plotW / months.length} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {m && <Tooltip tip={{ x: x(hover), y: y(m.net), title: monthLabel(m.month), rows: [['Net', formatMoney(m.net)], ['Inflow', formatMoney(m.inflow)], ['Outflow', formatMoney(m.outflow)]] }} />}
    </div>
  )
}

// A breakdown by category: one horizontal bar each, single hue, its amount written beside it.
export function CategoryBars({ rows, color = SERIES.inflow }) {
  const shown = rows.filter((r) => r.value > 0)
  if (!shown.length) return <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">Nothing to break down yet.</p>
  const max = Math.max(...shown.map((r) => r.value))
  return (
    <ul className="grid gap-2" aria-label="Breakdown by category">
      {shown.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-2 text-[11.5px]" title={`${r.label}: ${formatMoney(r.value)}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-2.5 rounded bg-[#f1f4f8]"><i className="block h-full rounded" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <b className="tabular-nums text-navy-950">{compactMoney(r.value)}</b>
        </li>
      ))}
    </ul>
  )
}
