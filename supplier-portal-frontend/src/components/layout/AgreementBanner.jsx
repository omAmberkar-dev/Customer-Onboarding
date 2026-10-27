import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, ChevronRight, Info, LockOpen, PauseCircle } from 'lucide-react'
import useAuth from '../../hooks/useAuth'
import { STAGES } from '../../utils/stages'
import { formatDate } from '../agreement/agreementUtils'
import { getRenewal } from '../../api/vendorApi'

const TONES = {
  red: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100/70',
  blue: 'border-[#b3c3e4] bg-[#eef2fb] text-[#052e86] hover:bg-[#dce6ff]/60',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100/70',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
}

// One banner at a time for an active vendor, by priority: on hold, hold released, agreement ending, renewal requested.
// The whole banner links to the Agreements page.
export default function AgreementBanner() {
  const { profile, stage } = useAuth()
  const [renewal, setRenewal] = useState(null)
  const active = stage === STAGES.active

  useEffect(() => {
    if (!active) return undefined
    let ignore = false
    getRenewal().then((value) => { if (!ignore) setRenewal(value) }).catch(() => {})
    return () => { ignore = true }
  }, [active])

  if (!active) return null
  const hold = profile?.agreement_hold
  const expiry = profile?.agreement_expiry
  const sent = profile?.agreement
  const open = renewal?.open_request

  let banner = null
  if (hold?.on_hold) {
    const text = hold.reason === 'between_agreements'
      ? `Your agreement is not in force. Actions are on hold until your next agreement starts on ${formatDate(hold.next_start)}.`
      : `Your agreement expired on ${formatDate(hold.expired_on)}. Actions are on hold until a new agreement is signed.`
    banner = { tone: 'red', icon: PauseCircle, text, cta: sent?.can_sign ? 'Sign your renewal' : open ? '' : 'Request renewal', to: sent?.can_sign ? `/agreements/${sent.agreement_id}/sign` : '/agreements?renew=1' }
  } else if (hold?.released_until) {
    banner = { tone: 'blue', icon: LockOpen, text: `Actions are temporarily allowed until ${formatDate(hold.released_until)}.`, cta: '', to: '/agreements' }
  } else if (expiry?.expiring) {
    const days = expiry.days_left
    banner = {
      tone: 'amber', icon: AlertTriangle,
      text: `Your agreement ends on ${formatDate(expiry.end_date)} (${days === 0 ? 'last day' : days === 1 ? '1 day left' : `${days} days left`}).`,
      cta: sent?.can_sign ? 'Sign your renewal' : open ? '' : 'Request renewal',
      to: sent?.can_sign ? `/agreements/${sent.agreement_id}/sign` : '/agreements?renew=1',
    }
  } else if (open) {
    banner = { tone: 'slate', icon: CalendarClock, text: `Renewal requested for ${formatDate(open.start_date)}. Our team will respond soon.`, cta: '', to: '/agreements' }
  }
  if (!banner) return null

  const Icon = banner.icon || Info
  return (
    <Link to={banner.to} className={`no-print relative z-20 flex shrink-0 items-center gap-2.5 border-b px-4 py-2 text-xs font-semibold transition sm:px-5 ${TONES[banner.tone]}`} role="status">
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{banner.text}</span>
      {banner.cta && <span className="inline-flex shrink-0 items-center gap-1 font-bold underline">{banner.cta} <ChevronRight size={14} /></span>}
    </Link>
  )
}
