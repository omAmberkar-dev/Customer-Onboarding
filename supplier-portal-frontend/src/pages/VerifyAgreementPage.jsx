import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, ShieldAlert } from 'lucide-react'
import AppLogo from '../components/common/AppLogo'
import Loader from '../components/common/Loader'
import PageContainer from '../components/layout/PageContainer'
import { formatDate } from '../components/agreement/agreementUtils'
import { verifyAgreementPublic } from '../api/vendorApi'

// Public page (no login) opened from the QR code on a signed agreement: is this a genuine signed agreement?
export default function VerifyAgreementPage() {
  const [params] = useSearchParams()
  const no = params.get('no') || ''
  const h = params.get('h') || ''
  const [state, setState] = useState({ loading: Boolean(no && h), result: null, error: '' })

  useEffect(() => {
    if (!no || !h) return undefined
    let ignore = false
    verifyAgreementPublic(no, h)
      .then((result) => { if (!ignore) setState({ loading: false, result, error: '' }) })
      .catch((err) => { if (!ignore) setState({ loading: false, result: null, error: err.message }) })
    return () => { ignore = true }
  }, [no, h])

  const valid = Boolean(state.result?.valid)
  const rows = valid ? [['Agreement number', state.result.agreement_no], ['Customer', state.result.vendor_name], ['Signed on', formatDate(state.result.signed_at)]] : []

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f1f4f8]">
      <div className="pointer-events-none absolute -right-28 top-20 size-96 rounded-full border-[60px] border-[#dce6ff]/50" aria-hidden="true" />
      <header className="relative z-10 border-b border-slate-200 bg-white px-5 py-3 sm:px-8"><AppLogo compact /></header>
      <main className="relative z-10 grid flex-1 place-items-center py-12">
        <PageContainer className="max-w-xl">
          <section className="overflow-hidden rounded-2xl border border-[#b3c3e4]/80 bg-white shadow-[0_22px_60px_rgba(40,83,130,0.1)]" aria-live="polite">
            {state.loading ? (
              <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm font-semibold text-slate-600"><Loader /> Checking the agreement…</div>
            ) : (
              <>
                <div className={`px-6 py-7 sm:px-9 ${valid ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`grid size-12 place-items-center rounded-full ${valid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {valid ? <BadgeCheck size={26} /> : <ShieldAlert size={26} />}
                  </span>
                  <p className="eyebrow mt-5">Agreement verification</p>
                  <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-navy-950">{valid ? 'Valid agreement' : 'Not valid'}</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {valid
                      ? 'This is a genuine, signed customer agreement.'
                      : state.error || 'We could not match this agreement. The link may be incomplete or the document may not be genuine.'}
                  </p>
                </div>
                {valid && (
                  <dl className="divide-y divide-slate-100 px-6 py-2 sm:px-9">
                    {rows.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 py-3">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                        <dd className="min-w-0 break-words text-right text-sm font-bold text-navy-900">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}
          </section>
        </PageContainer>
      </main>
    </div>
  )
}
