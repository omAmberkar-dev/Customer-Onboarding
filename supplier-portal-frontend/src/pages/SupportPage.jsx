import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, FileText, Landmark, Mail, Replace, Send, UserRound } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Loader from '../components/common/Loader'
import { sendSupportRequest } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { OPEN_PROFILE_EVENT } from '../utils/events'

const card = 'rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'
const field = 'mt-1.5 w-full rounded-lg border bg-white px-3 text-[13px] text-navy-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'

// The topics the backend accepts (support_requests.TOPICS).
const SUPPORT_TOPICS = [
  ['general', 'General question'],
  ['invoice', 'Invoices'],
  ['loan', 'Loans, sanctions and drawdowns'],
  ['change_request', 'Changing my details'],
  ['account', 'My account and sign-in'],
]
const MESSAGE_MIN = 10
const MESSAGE_MAX = 2000

// Where each common question is answered in the portal itself.
const TOPICS = [
  { icon: Replace, title: 'Change my details', text: 'Address, bank or contact details: send a change request from your profile. Your current details stay active until it is approved.', profile: true },
  { icon: FileText, title: 'An invoice was returned', text: 'Open Invoices, read the reasons on the returned invoice, and replace it with a corrected one.', to: '/invoices' },
  { icon: Landmark, title: 'My loan, sanction or drawdown', text: 'Follow your loan application, sanction and drawdowns, and download their memos.', to: '/loans' },
]

// The message form: sent by the backend through the portal's email service (never an email app on this device). Success
// is shown only once the backend confirms it sent the email; while sending, the button cannot be pressed again.
function SupportForm({ customerId }) {
  const [values, setValues] = useState({ topic: '', reference: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const set = (key) => (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setFieldErrors((f) => ({ ...f, [key]: '' })) }
  const length = values.message.trim().length
  const ready = values.topic && length >= MESSAGE_MIN && length <= MESSAGE_MAX

  const submit = async (event) => {
    event.preventDefault()
    if (!ready || sending) return
    setSending(true)
    setError('')
    try {
      setSent(await sendSupportRequest({ topic: values.topic, reference: values.reference.trim(), message: values.message.trim() }))
      setValues({ topic: '', reference: '', message: '' })
    } catch (err) {
      setError(err.message || 'Your message could not be sent. Please try again.')
      setFieldErrors(err.body?.fields || {})
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-900"><CheckCircle2 size={18} aria-hidden="true" /> Your message has been sent to our support team.</p>
        <p className="mt-1 text-xs text-emerald-900">Reference <b>{sent.request_id}</b>, sent {sent.submitted_at}. Quote it if you write to us again about this.</p>
        <button type="button" onClick={() => setSent(null)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100">Send another message</button>
      </div>
    )
  }

  const border = (key) => (fieldErrors[key] ? 'border-red-400' : 'border-[#c2cdda]')
  return (
    <form onSubmit={submit} noValidate className="mt-3 grid gap-2.5" aria-busy={sending || undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">
          What is it about? <span className="text-red-600" aria-hidden="true">*</span>
          <select value={values.topic} onChange={set('topic')} required disabled={sending} aria-invalid={Boolean(fieldErrors.topic) || undefined} className={`${field} ${border('topic')} min-h-11 sm:min-h-9`}>
            <option value="">Choose a topic</option>
            {SUPPORT_TOPICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {fieldErrors.topic && <span className="mt-1 block text-[11.5px] font-medium text-red-700">{fieldErrors.topic}</span>}
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Invoice, request or loan number <span className="font-normal text-slate-500">(optional)</span>
          <input value={values.reference} onChange={set('reference')} maxLength={60} disabled={sending} placeholder="e.g. INV-2026-0043" aria-invalid={Boolean(fieldErrors.reference) || undefined} className={`${field} ${border('reference')} min-h-11 sm:min-h-9`} />
          {fieldErrors.reference && <span className="mt-1 block text-[11.5px] font-medium text-red-700">{fieldErrors.reference}</span>}
        </label>
      </div>
      <label className="text-xs font-semibold text-slate-700">
        Your message <span className="text-red-600" aria-hidden="true">*</span>
        <textarea value={values.message} onChange={set('message')} required rows={4} maxLength={MESSAGE_MAX} disabled={sending} aria-invalid={Boolean(fieldErrors.message) || undefined} aria-describedby="support-message-count" className={`${field} ${border('message')} py-2 leading-5`} />
        <span id="support-message-count" className="mt-1 flex justify-between text-[11.5px] font-normal text-slate-500">
          <span className="font-medium text-red-700">{fieldErrors.message}</span>
          <span>{length < MESSAGE_MIN ? `At least ${MESSAGE_MIN} characters` : `${length} / ${MESSAGE_MAX}`}</span>
        </span>
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready || sending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] sm:min-h-9 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? <Loader /> : <Send size={15} />} {sending ? 'Sending…' : 'Send message'}
        </button>
        <p className="text-[11.5px] text-slate-500">Sent with your customer ID{customerId ? ` (${customerId})` : ''}, name and email so we can reply.</p>
      </div>
    </form>
  )
}

// Support: a message to the support team (sent by the portal), the customer's relationship manager when one is assigned,
// and where common questions are answered.
export default function SupportPage() {
  const { profile } = useAuth()
  const rm = String(profile?.assigned_rm || '').trim()
  return (
    <AppShell breadcrumb="Support">
      <PageContainer className="grid gap-3 pb-4">
        <div>
          <h1 className="text-base font-extrabold text-navy-950">Support</h1>
          <p className="text-xs text-slate-600">Send our team a message, or find where your question is answered.</p>
        </div>
        {/* Left: the message form; right: the relationship manager and the common questions, so nothing sits below. */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <section className={`${card} px-4 py-3.5`} aria-labelledby="support-email">
            <h2 id="support-email" className="flex items-center gap-2 text-sm font-extrabold text-navy-950"><span className="grid size-7 place-items-center rounded-md bg-brand-50 text-brand-700"><Mail size={15} aria-hidden="true" /></span> Message our support team</h2>
            <p className="mt-1 text-xs text-slate-600">Tell us what you need. Mention the invoice, request or loan number where it applies.</p>
            <SupportForm customerId={profile?.vendor_id} />
          </section>
          <div className="grid min-w-0 gap-3">
            <section className={`${card} px-4 py-3`} aria-labelledby="support-rm">
              <h2 id="support-rm" className="flex items-center gap-2 text-sm font-extrabold text-navy-950"><span className="grid size-7 place-items-center rounded-md bg-emerald-50 text-emerald-700"><UserRound size={15} aria-hidden="true" /></span> Your relationship manager</h2>
              {rm
                ? <p className="mt-1.5 text-xs leading-5 text-slate-600"><b className="text-navy-900">{rm}</b> looks after your account. To reach them, send a message here and the support team will pass it on.</p>
                : <p className="mt-1.5 text-xs leading-5 text-slate-600">No relationship manager is assigned to your account yet. The support team can help in the meantime.</p>}
            </section>
            <section className={`${card} px-4 py-3`} aria-labelledby="support-topics">
              <h2 id="support-topics" className="mb-2 text-sm font-extrabold text-navy-950">Common questions</h2>
              <ul className="grid gap-2">
                {TOPICS.map((t) => {
                  const inner = (
                    <>
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><t.icon size={14} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-bold text-navy-900">{t.title}</span><span className="block text-[11.5px] leading-4 text-slate-600">{t.text}</span></span>
                      <ChevronRight size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
                    </>
                  )
                  const cls = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-[#e5eaf1] px-2.5 py-2 text-left transition hover:border-brand-100 hover:bg-[#f7f9fc]'
                  return (
                    <li key={t.title}>
                      {t.profile
                        ? <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PROFILE_EVENT))} className={cls}>{inner}</button>
                        : <Link to={t.to} className={cls}>{inner}</Link>}
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  )
}
