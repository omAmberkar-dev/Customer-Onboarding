import { useMemo, useState } from 'react'
import { Check, ChevronRight, Circle, CircleDot, FileCheck2, GitBranch, HandCoins, HelpCircle, Landmark, ShieldCheck, Users, WalletCards, XCircle } from 'lucide-react'
import { currentPhaseOf, sameSanction, trackerOf } from '../../utils/loanTracker'
import { formatLoanDate, formatMoney } from '../../utils/loans'

const card = 'rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'
const PHASE_ICON = { origination: Users, sanction: ShieldCheck, disbursement: WalletCards, servicing: HandCoins }

// Each state's marker, colours and words (for the badge and for screen readers).
const LOOK = {
  done: { icon: Check, mark: 'border-emerald-600 bg-emerald-600 text-white', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', words: 'Done' },
  current: { icon: CircleDot, mark: 'border-brand-600 bg-white text-brand-600 ring-4 ring-brand-100', badge: 'border-brand-100 bg-brand-50 text-brand-700', words: 'In progress' },
  upcoming: { icon: Circle, mark: 'border-[#d8e0e9] bg-white text-slate-300', badge: 'border-slate-200 bg-slate-50 text-slate-600', words: 'Not started' },
  stopped: { icon: XCircle, mark: 'border-slate-300 bg-slate-100 text-slate-500', badge: 'border-slate-300 bg-slate-100 text-slate-700', words: 'Not approved' },
  unknown: { icon: HelpCircle, mark: 'border-amber-300 bg-amber-50 text-amber-700', badge: 'border-amber-200 bg-amber-50 text-amber-800', words: 'Can’t be checked now' },
}

const money = (sum) => (sum.amount === null ? 'Several currencies' : formatMoney(sum.amount, sum.currency))

function Totals({ totals }) {
  const items = [
    [FileCheck2, 'Applications', String(totals.applications)],
    [Landmark, 'Active facilities', String(totals.activeFacilities)],
    [ShieldCheck, 'Sanctioned limit', money(totals.sanctionedLimit)],
    [WalletCards, 'Disbursed', money(totals.disbursed)],
  ]
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#d8e0e9] bg-[#d8e0e9] sm:grid-cols-4 lg:shrink-0">
      {items.map(([Icon, term, value]) => (
        <div key={term} className="min-w-0 bg-white/90 px-3 py-1.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Icon size={13} aria-hidden="true" /> {term}</dt>
          <dd className="break-words text-sm font-extrabold text-navy-950">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Phase({ phase, index, current, last }) {
  const Icon = PHASE_ICON[phase.id]
  const look = LOOK[phase.state]
  return (
    <li className="relative min-w-0" aria-current={current ? 'step' : undefined}>
      {/* The numbered node and the line to the next phase, as on LAS's Lifecycle map. */}
      <div className="mb-1.5 flex items-center gap-2" aria-hidden="true">
        <span className={`grid h-6 min-w-8 place-items-center rounded-full border px-2 text-[10.5px] font-extrabold ${current ? 'border-brand-600 bg-brand-600 text-white' : phase.state === 'done' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-[#d8e0e9] bg-white text-slate-500'}`}>{String(index + 1).padStart(2, '0')}</span>
        {!last && <span className={`hidden h-0.5 flex-1 rounded xl:block ${phase.state === 'done' ? 'bg-emerald-500' : 'bg-[#d8e0e9]'}`} />}
        {!last && <ChevronRight size={14} className="hidden text-slate-400 xl:block" />}
      </div>
      <article className={`${card} flex h-full flex-col px-3 py-2.5 ${current ? 'border-brand-600 ring-2 ring-brand-600/15' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${current ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}><Icon size={16} aria-hidden="true" /></span>
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${look.badge}`}>{current && phase.state !== 'done' ? 'You are here' : look.words}</span>
        </div>
        <h3 className="mt-2 text-sm font-extrabold text-navy-950">{phase.title}</h3>
        <p className="text-[11.5px] leading-4 text-slate-600">{phase.description}</p>
        <ol className="mb-2 mt-2 grid gap-1.5 border-t border-[#eef1f5] pt-2" aria-label={`${phase.title} steps`}>
          {phase.steps.map((s) => {
            const step = LOOK[s.state]
            return (
              <li key={s.label} className="flex gap-2">
                <span className={`mt-px grid size-4 shrink-0 place-items-center rounded-full border-2 ${step.mark}`} aria-hidden="true"><step.icon size={9} strokeWidth={3} /></span>
                <div className="min-w-0">
                  <p className={`text-[12.5px] font-semibold leading-5 ${s.state === 'upcoming' ? 'text-slate-500' : 'text-navy-900'}`}>{s.label} <span className="sr-only">({step.words})</span></p>
                  {(s.note || s.amount) && <p className="text-[11.5px] leading-4 text-slate-600">{s.amount ? `${formatMoney(s.amount.amount, s.amount.currency)} paid out` : s.note}</p>}
                  {s.date && <p className="text-[11px] text-slate-500">{formatLoanDate(s.date)}</p>}
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-auto flex items-center gap-1.5 border-t border-[#eef1f5] pt-2 text-[11px] font-medium text-slate-500"><Users size={12} aria-hidden="true" /> {phase.owner}</p>
      </article>
    </li>
  )
}

// The application register (LAS's "Application register"): each application with its current phase; choosing one
// focuses the tracker on it.
function Register({ journey, focus, onFocus }) {
  return (
    <section className={`${card} min-w-0 px-3.5 py-3`} aria-labelledby="tracker-register">
      <h3 id="tracker-register" className="text-sm font-extrabold text-navy-950">Your applications</h3>
      <p className="mb-1.5 text-[11.5px] text-slate-500">Each application in its current phase. Choose one to follow it on its own.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[#e5eaf1] text-[11px] text-slate-500">
              {['Request No.', 'Sanction No.', 'Product', 'Current phase', 'Limit', 'Applied on', 'Drawdowns'].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {journey.sanctions.map((s) => {
              const phase = currentPhaseOf(journey, s.id)
              const selected = focus === s.id
              const draws = journey.drawdowns.filter((d) => sameSanction(s.sanctionNo, d.sanctionNo)).length
              return (
                <tr key={s.id} className={`border-b border-[#f0f3f7] last:border-0 ${selected ? 'bg-brand-50/60' : ''}`}>
                  <td className="py-1 pr-3">
                    <button type="button" onClick={() => onFocus(selected ? 'all' : s.id)} aria-pressed={selected} className="inline-flex min-h-8 items-center gap-1 font-bold text-brand-700 hover:underline">
                      {s.requestNo || s.id} <span className="sr-only">{selected ? '(shown in the tracker, choose to show all)' : '(show in the tracker)'}</span>
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-slate-700">{s.sanctionNo || '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-700">{s.product || '—'}</td>
                  <td className="py-1.5 pr-3"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${LOOK[phase.state].badge}`}>{phase.title}{phase.state === 'stopped' ? ' · not approved' : ''}</span></td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-semibold text-navy-900">{formatMoney(s.limit, s.currency)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-700">{formatLoanDate(s.appliedOn)}</td>
                  <td className="py-1.5 text-slate-700">{draws}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// The loan tracker: LAS's Lifecycle (four phases, their steps and who acts) for this customer's own loans, from the
// journey LAS sends (utils/loanTracker.js has the rules).
export default function LoanTracker({ journey }) {
  const [focus, setFocus] = useState('all')
  const tracker = useMemo(() => trackerOf(journey, { sanctionId: focus }), [journey, focus])
  const chosen = journey.sanctions.find((s) => s.id === focus)
  const chip = (active) => `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-[#c2cdda] bg-white text-navy-900 hover:border-brand-600 hover:bg-brand-50'}`
  return (
    <div className="grid gap-3">
      <section className="flex flex-col gap-3 rounded-xl border border-[#c9d7f5] bg-gradient-to-r from-[#f4f7ff] to-[#eaf0ff] px-4 py-3 lg:flex-row lg:items-center lg:justify-between" aria-labelledby="tracker-title">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-700"><GitBranch size={13} aria-hidden="true" /> Loan against securities</p>
          <h2 id="tracker-title" className="mt-0.5 text-base font-extrabold text-navy-950">From application to closure</h2>
          <p className="mt-0.5 text-xs text-slate-600">{chosen ? `Sanction Request No. ${chosen.requestNo}${chosen.sanctionNo ? ` · Sanction No. ${chosen.sanctionNo}` : ''}` : 'Every step of your loan, as the bank records it.'}</p>
        </div>
        <Totals totals={tracker.totals} />
      </section>

      {journey.sanctions.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show applications">
          <button type="button" className={chip(focus === 'all')} aria-pressed={focus === 'all'} onClick={() => setFocus('all')}>All applications <b>{journey.sanctions.length}</b></button>
          {journey.sanctions.map((s) => (
            <button key={s.id} type="button" className={chip(focus === s.id)} aria-pressed={focus === s.id} onClick={() => setFocus(s.id)}>
              Request {s.requestNo}{s.sanctionNo ? ` · Sanction ${s.sanctionNo}` : ''}
            </button>
          ))}
        </div>
      )}

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Your loan journey">
        {tracker.phases.map((phase, index) => (
          <Phase key={phase.id} phase={phase} index={index} current={phase.id === tracker.current} last={index === tracker.phases.length - 1} />
        ))}
      </ol>
      <p className="-mt-1 text-[11px] text-slate-500">Updated each time you open this page or press Refresh. Disbursed is the amount paid out to you; repayments are not deducted from it.</p>

      {journey.sanctions.length > 0 && <Register journey={journey} focus={focus} onFocus={setFocus} />}
    </div>
  )
}
