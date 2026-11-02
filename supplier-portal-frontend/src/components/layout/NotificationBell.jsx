import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCircle2, Clock, Undo2, XCircle } from 'lucide-react'
import { getMyNotifications, markNotificationsRead } from '../../api/vendorApi'
import { formatLoanDate } from '../../utils/loans'

// The header bell, after LAS Central's (src/layout/NotificationBell.jsx): what needs the customer first, then every stage
// of each workflow (the application, its agreement, loans, drawdowns, invoices, payments, repayments, change requests),
// grouped by workflow, each with a chip naming the stage (Maker, Checker, Authorizer, Approved, ...). The items come from
// the backend (notifications_feed.py), worked out from the records each time; the badge counts unread items, and opening
// one marks it read and goes to its page.
const ICONS = { pending: Clock, back: Undo2, rejected: XCircle, approved: CheckCircle2, overdue: AlertTriangle }
const TONES = {
  pending: 'bg-amber-50 text-amber-700', back: 'bg-violet-50 text-violet-700', rejected: 'bg-red-50 text-red-700',
  approved: 'bg-emerald-50 text-emerald-700', overdue: 'bg-red-50 text-red-700',
}

// The workflows, in the order the panel shows them.
const WORKFLOWS = [
  ['onboarding', 'Application'], ['agreement', 'Agreement'], ['loans', 'Loans'], ['drawdowns', 'Drawdowns'], ['invoices', 'Invoices'],
  ['payments', 'Payments'], ['repayments', 'Repayments'], ['change_requests', 'Change requests'], ['other', 'Other'],
]
// An item from before workflows were sent: its page says which workflow it is.
const WORKFLOW_BY_PAGE = {
  '/application-status': 'onboarding', '/request-vendor': 'onboarding', '/agreement': 'agreement', '/agreements': 'agreement', '/loans': 'loans',
  '/drawdowns': 'drawdowns', '/cashflow': 'drawdowns', '/invoices': 'invoices', '/payments': 'payments', '/repayments': 'repayments',
  '/update-requests': 'change_requests',
}
const workflowOf = (item) => (WORKFLOWS.some(([key]) => key === item.workflow) ? item.workflow : WORKFLOW_BY_PAGE[item.to] || 'other')

// Each stage's chip: its words and colour.
const STAGE_CHIPS = {
  draft: ['Draft', 'bg-slate-100 text-slate-700'],
  submitted: ['Submitted', 'bg-slate-100 text-slate-700'],
  maker: ['Maker', 'bg-[#eef2fb] text-brand-700'],
  checker: ['Checker', 'bg-[#eef2fb] text-brand-700'],
  authorizer: ['Authorizer', 'bg-[#eef2fb] text-brand-700'],
  returned: ['Returned to you', 'bg-violet-50 text-violet-700'],
  agreement: ['To sign', 'bg-amber-50 text-amber-800'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
  account: ['Account set up', 'bg-emerald-50 text-emerald-700'],
  disbursed: ['Disbursed', 'bg-emerald-50 text-emerald-700'],
  settled: ['Settled', 'bg-emerald-50 text-emerald-700'],
  confirmed: ['Confirmed', 'bg-emerald-50 text-emerald-700'],
  verifying: ['Verifying', 'bg-amber-50 text-amber-800'],
  due: ['Due soon', 'bg-amber-50 text-amber-800'],
  overdue: ['Overdue', 'bg-red-50 text-red-700'],
  rejected: ['Not approved', 'bg-red-50 text-red-700'],
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ items: [], unread: 0, readState: true, error: '' })
  const box = useRef(null)
  const button = useRef(null)

  const load = useCallback(() => {
    getMyNotifications()
      .then((body) => setState({ items: [], unread: 0, readState: true, ...body, error: '' }))
      .catch((err) => setState((s) => ({ ...s, error: err?.message || 'Unable to load your notifications.' })))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (open) load() }, [open, load])

  // Closed by a click elsewhere or Escape (which gives the focus back to the bell).
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const markRead = (ids) => {
    setState((s) => {
      const items = s.items.map((i) => (ids === 'all' || ids.includes(i.id) ? { ...i, read: true } : i))
      return { ...s, items, unread: items.filter((i) => !i.read).length }
    })
    markNotificationsRead(ids).catch(() => load())
  }
  const follow = (item) => {
    setOpen(false)
    if (!item.read && state.readState) markRead([item.id])
    if (item.to) navigate(item.to)
  }

  const actions = state.items.filter((i) => i.kind === 'action')
  const updates = state.items.filter((i) => i.kind !== 'action')
  const groups = WORKFLOWS.map(([key, label]) => [key, label, updates.filter((i) => workflowOf(i) === key)]).filter(([, , rows]) => rows.length)
  const label = (key) => WORKFLOWS.find(([k]) => k === key)?.[1] || 'Other'

  const row = (i, showWorkflow) => {
    const Icon = ICONS[i.tone] || Clock
    const [chipText, chipTone] = STAGE_CHIPS[i.stage] || []
    const detail = (i.detail || []).filter(Boolean)
    return (
      <li key={i.id}>
        <button type="button" onClick={() => follow(i)} className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-[#f2f5fd] focus-visible:bg-[#f2f5fd] focus-visible:outline-none ${i.read ? '' : 'bg-[#f7f9ff]'}`}>
          <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ${TONES[i.tone] || TONES.pending}`}><Icon size={14} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <b className={`block break-words text-[12.5px] leading-5 text-navy-900 ${i.read ? 'font-semibold' : 'font-extrabold'}`}>{i.title}{!i.read && <span className="sr-only"> (unread)</span>}</b>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {chipText && <span className={`rounded px-1.5 text-[10px] font-bold leading-4 ${chipTone}`}><span className="sr-only">Stage: </span>{chipText}</span>}
              {showWorkflow && <span className="text-[10.5px] font-semibold text-slate-500">{label(workflowOf(i))}</span>}
              {detail.length > 0 && <small className="min-w-0 break-words text-[11px] text-slate-500">{detail.join(' · ')}</small>}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {i.on && <time dateTime={i.on} className="whitespace-nowrap text-[10.5px] text-slate-500">{formatLoanDate(i.on)}</time>}
            {!i.read && <i className="size-2 rounded-full bg-brand-600" aria-hidden="true" />}
          </span>
        </button>
      </li>
    )
  }
  const heading = (title, count, id) => (
    <h4 id={id} className="flex items-center gap-2 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-slate-500">
      {title}<span className="rounded-full bg-[#eef2fb] px-1.5 text-brand-700">{count}</span>
    </h4>
  )

  return (
    <div className="relative" ref={box}>
      <button ref={button} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title="Notifications"
        aria-label={state.unread ? `Notifications: ${state.unread} unread` : 'Notifications'} className="interactive-icon relative">
        <Bell size={17} />
        {state.unread > 0 && <b className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9.5px] font-bold leading-4 text-white" aria-hidden="true">{state.unread > 99 ? '99+' : state.unread}</b>}
      </button>
      {open && (
        // On a phone the panel spans the screen under the header (8px each side); from sm up it hangs from the bell.
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-2 top-16 z-40 overflow-hidden rounded-xl border border-[#d8e0e9] bg-white shadow-[0_12px_32px_rgba(11,55,104,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[24rem]">
          <header className="flex items-center justify-between gap-2 border-b border-[#eef1f5] px-3 py-2">
            <h3 className="text-sm font-extrabold text-navy-950">Notifications</h3>
            {state.readState && state.unread > 0 && <button type="button" onClick={() => markRead('all')} className="min-h-8 text-xs font-semibold text-brand-700 hover:underline">Mark all read</button>}
          </header>
          <div className="max-h-[min(70svh,34rem)] overflow-y-auto overscroll-contain">
            {state.error && <p role="alert" className="px-3 py-2 text-xs text-red-700">{state.error}</p>}
            <section className="py-1" aria-labelledby="nb-actions">
              {heading('Needs your attention', actions.length, 'nb-actions')}
              {actions.length ? <ul>{actions.map((i) => row(i, true))}</ul> : <p className="px-3 py-2 text-xs text-slate-500">Nothing needs you right now.</p>}
            </section>
            {groups.length ? groups.map(([key, title, rows]) => (
              <section key={key} className="border-t border-[#eef1f5] py-1" aria-labelledby={`nb-${key}`}>
                {heading(title, rows.length, `nb-${key}`)}
                <ul>{rows.map((i) => row(i, false))}</ul>
              </section>
            )) : <p className="border-t border-[#eef1f5] px-3 py-2 text-xs text-slate-500">No updates in the last 30 days.</p>}
            {state.unavailable?.length > 0 && <p className="border-t border-[#eef1f5] px-3 py-2 text-[11px] text-slate-500">Some updates can’t be checked right now.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
