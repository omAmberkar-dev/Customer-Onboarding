import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, RefreshCw, Search, X } from 'lucide-react'
import Loader from '../common/Loader'
import { downloadStatement } from '../../api/vendorApi'
import { label, toneOf } from '../../utils/finance'

export const card = 'rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'
// A row of four KPI cards: two across on a phone (compact, less scrolling), four on a wide screen.
export const KPI_GRID = 'grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4'

// The reference KPI card (LAS StatCard): a dot and label, an icon tile, the figure, a caption, and an accent rail.
const KPI_TONE = {
  blue: ['bg-brand-600', 'bg-brand-50 text-brand-700'],
  green: ['bg-emerald-600', 'bg-emerald-50 text-emerald-700'],
  amber: ['bg-amber-500', 'bg-amber-50 text-amber-700'],
  red: ['bg-red-600', 'bg-red-50 text-red-700'],
  navy: ['bg-[#002880]', 'bg-[#e6edff] text-[#002880]'],
}
export function KpiCard({ label: name, value, caption, icon: Icon, tone = 'blue', unavailable = false }) {
  const [accent, tile] = KPI_TONE[tone] || KPI_TONE.blue
  return (
    <article className={`${card} relative min-w-0 overflow-hidden px-3 pb-3 pt-2.5 sm:px-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-slate-600"><i className={`size-1.5 shrink-0 rounded-full ${accent}`} aria-hidden="true" /><span className="truncate">{name}</span></h3>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${tile}`}><Icon size={15} aria-hidden="true" /></span>
      </div>
      {unavailable
        ? <p className="mt-0.5 text-[13px] font-semibold text-slate-500">Unavailable</p>
        : <p className="mt-0.5 break-words text-[15px] font-extrabold leading-6 text-navy-950 sm:text-lg">{value}</p>}
      {caption && <p className="mt-0.5 truncate text-[11px] text-slate-500" title={caption}>{caption}</p>}
      <span className={`absolute inset-x-0 bottom-0 h-[3px] ${accent} opacity-80`} aria-hidden="true" />
    </article>
  )
}

const PILL = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blue: 'border-brand-100 bg-brand-50 text-brand-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-700',
  grey: 'border-slate-200 bg-slate-50 text-slate-600',
}
export const StatusPill = ({ status, text }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${PILL[toneOf(status)]}`}>{text || label(status)}</span>
)

// A record's details: a sheet from the bottom on a phone, a centred dialog from tablet up. Closes on Escape and outside.
export function Drawer({ title, titleId, status, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[90svh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl`}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-sm font-extrabold text-navy-950">{title}</h2>
            {status && <div className="mt-1 flex flex-wrap gap-1">{status}</div>}
          </div>
          <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Label / value pairs, two across.
export const Facts = ({ rows }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
    {rows.map(([term, value]) => <div key={term} className="min-w-0"><dt className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-slate-500">{term}</dt><dd className="break-words font-semibold text-navy-900">{value}</dd></div>)}
  </dl>
)

// A small heading inside a drawer.
export const SubHeading = ({ children }) => <h3 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">{children}</h3>

export function Panel({ title, subtitle, action, children, className = '', id }) {
  const headingId = id || `panel-${String(title).toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section className={`${card} min-w-0 px-3.5 py-3 ${className}`} aria-labelledby={headingId}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-extrabold text-navy-950">{title}</h2>
          {subtitle && <p className="text-[11.5px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// A page's title row with Refresh.
export function PageHeader({ title, subtitle, onRefresh, loading, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-extrabold text-[#000000]">{title}</h1>
        {subtitle && <p className="text-xs text-[#5f5f5f]">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-3 text-[12.5px] font-semibold text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] disabled:opacity-50">
            {loading ? <Loader /> : <RefreshCw size={14} />} Refresh
          </button>
        )}
      </div>
    </div>
  )
}

// What a screen shows before or instead of its figures.
export function LoadState({ finance, children }) {
  const { data, error, loading, reload } = finance
  if (loading && !data) return <div role="status" className="flex items-center gap-2 px-1 py-6 text-sm font-semibold text-slate-600"><Loader /> Loading your loan figures…</div>
  if (error && !data) {
    return (
      <section className={`${card} px-5 py-8 text-center`}>
        <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
        <button type="button" onClick={reload} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-3 text-xs font-semibold text-navy-900 hover:bg-[#eef2fb]"><RefreshCw size={14} /> Try again</button>
      </section>
    )
  }
  if (!data?.onboarded) {
    return <section className={`${card} px-5 py-8 text-center text-sm text-slate-600`}>Your loan account is being set up. Your facilities and transactions will appear here once it is ready.</section>
  }
  return children(data)
}

export const Unavailable = ({ what }) => (
  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{what} can’t be shown right now. Please check again later.</p>
)

// The filter row above a table: date range, the selects each screen needs, and a search box.
export function FilterBar({ filters, onChange, selects = [], search = true, dateLabel = 'Date' }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value })
  const field = 'h-9 rounded-lg border border-[#c2cdda] bg-white px-2.5 text-xs text-navy-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'
  const active = Object.values(filters).some(Boolean)
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filters">
      <label className="grid gap-0.5 text-[10.5px] font-semibold text-slate-500">{dateLabel} from<input type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} className={field} /></label>
      <label className="grid gap-0.5 text-[10.5px] font-semibold text-slate-500">to<input type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} className={field} /></label>
      {selects.map(({ key, label: name, options }) => (
        <label key={key} className="grid gap-0.5 text-[10.5px] font-semibold text-slate-500">{name}
          <select value={filters[key]} onChange={set(key)} className={`${field} min-w-32`}>
            <option value="">All</option>
            {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      ))}
      {search && (
        <label className="relative grid min-w-44 flex-1 gap-0.5 text-[10.5px] font-semibold text-slate-500 sm:max-w-64">Search
          <Search size={14} className="pointer-events-none absolute bottom-2.5 left-2.5 text-slate-400" aria-hidden="true" />
          <input value={filters.search} onChange={set('search')} placeholder="Reference, UTR, description…" className={`${field} pl-8`} />
        </label>
      )}
      {active && <button type="button" onClick={() => onChange(Object.fromEntries(Object.keys(filters).map((k) => [k, ''])))} className="h-9 px-2 text-xs font-semibold text-brand-700 hover:underline">Clear</button>}
    </div>
  )
}

// PDF and Excel statements of a section, with the screen's filters (search stays on screen: it is not a statement filter).
export function StatementButtons({ section, filters, disabled }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const statementFilters = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== 'search'))
  const get = async (format) => {
    setBusy(format)
    setError('')
    try { await downloadStatement(section, format, statementFilters) } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-3 text-[12.5px] font-semibold text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} disabled={disabled || !!busy} onClick={() => get('pdf')}>{busy === 'pdf' ? <Loader /> : <Download size={14} />} PDF statement</button>
      <button type="button" className={btn} disabled={disabled || !!busy} onClick={() => get('xlsx')}>{busy === 'xlsx' ? <Loader /> : <FileSpreadsheet size={14} />} Excel</button>
      {error && <p role="alert" className="w-full text-xs font-semibold text-red-700">{error}</p>}
    </div>
  )
}

// A compact, sortable, paged table. columns: [{ key, label, render?, align?, sort? (value to sort by), nowrap? }].
const PAGE = 25
export function DataTable({ columns, rows, empty, initialSort, rowKey = (r) => r.id, onRowClick, minWidth = 760, caption }) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: 'desc' })
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) || columns[0]
    const value = col.sort || ((r) => r[col.key])
    return [...rows].sort((a, b) => {
      const x = value(a), y = value(b)
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = sorted.slice(current * PAGE, current * PAGE + PAGE)
  if (!rows.length) return <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">{empty}</p>
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-[#e5eaf1] bg-[#f7f9fc] text-[10.5px] font-bold uppercase tracking-[0.03em] text-slate-500">
              {columns.map((c) => {
                const on = sort.key === c.key
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`px-2.5 py-1.5 font-bold ${c.align === 'right' ? 'text-right' : ''}`}>
                    <button type="button" onClick={() => setSort({ key: c.key, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })} className={`inline-flex items-center gap-1 uppercase hover:text-brand-700 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {c.label}{on && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-[#f0f3f7] last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-[#eef2fb]/50' : ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-2.5 py-1.5 align-middle ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.nowrap !== false ? 'whitespace-nowrap' : ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-[#eef1f5] pt-2 text-xs text-slate-600">
          <span>{current * PAGE + 1}–{Math.min(sorted.length, current * PAGE + PAGE)} of {sorted.length}</span>
          <span className="flex gap-1">
            <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="grid size-8 place-items-center rounded-md border border-[#d8e0e9] disabled:opacity-40"><ChevronLeft size={14} /></button>
            <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="grid size-8 place-items-center rounded-md border border-[#d8e0e9] disabled:opacity-40"><ChevronRight size={14} /></button>
          </span>
        </div>
      )}
    </div>
  )
}
