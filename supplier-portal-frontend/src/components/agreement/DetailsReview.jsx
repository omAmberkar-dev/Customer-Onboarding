import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, Minus, Paperclip } from 'lucide-react'
import { documentTypes } from '../../data/documentTypes'
import { getMyDocuments } from '../../api/vendorApi'
import { documentPreviewItems } from '../../utils/documentPreview'
import DocumentPreview from '../vendor-request/DocumentPreview'
import { displayProfileValue, isRegisteredMsme, sections } from '../layout/profileFields'
import { cinApplies } from '../../data/vendorTypes'

const wideKeys = new Set(['vendor_legal_name', 'street', 'account_holder_name'])

// Profile field -> the key it has in the agreement's details snapshot. Every address part maps to the one address.
const SNAPSHOT_KEY = {
  vendor_legal_name: 'legal_name', email: 'email', contact_no: 'phone', vendor_type: 'vendor_type', registration_number: 'registration_number',
  msme_status: 'msme_status', gstin: 'gstin', pan: 'pan', street: 'address', city: 'address', district: 'address', region: 'address',
  postal_code: 'address', account_holder_name: 'bank_holder', bank_name: 'bank_name', branch_name: 'bank_branch', ifsc_code: 'bank_ifsc',
  bank_account_no: 'bank_account_masked',
}

// The vendor's registered details, read-only, (the confirmation sits in the page footer).
export default function DetailsReview({ profile, updateInfo = null }) {
  // The supporting documents on file, each opening in the same viewer the application form uses. null while loading.
  const [documents, setDocuments] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  useEffect(() => {
    let ignore = false
    getMyDocuments().then((grouped) => { if (!ignore) setDocuments(grouped) }).catch(() => { if (!ignore) setDocuments({}) })
    return () => { ignore = true }
  }, [])
  const documentItems = useMemo(() => documentPreviewItems({}, documents || {}), [documents])
  const uploadedCount = documentTypes.filter(({ key }) => documentItems.some((item) => item.type === key)).length
  // On a re-issued agreement, the fields that changed since the previous version are flagged for a second look.
  const changedKeys = new Set(updateInfo?.changed_keys || [])
  const oldValue = (key) => (updateInfo?.changes || []).find((change) => change.key === key)?.from
  return (
    <div className="space-y-2.5">
      {sections.map(({ title, icon: Icon, fields }) => (
        <section key={title} className="overflow-hidden rounded-lg border border-[#d8e0e9] bg-white">
          <h3 className="flex items-center gap-1.5 border-b border-[#d8e0e9] bg-[#eef2fb] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">
            <Icon size={13} className="text-brand-600" /> {title}
          </h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
            {fields.filter(([key]) => (key !== 'udyam_number' || isRegisteredMsme(profile)) && (key !== 'cin' || cinApplies(profile?.msme_status) || String(profile?.cin ?? '').trim() !== '')).map(([key, label]) => (
              <div key={key} className={`min-w-0 ${wideKeys.has(key) ? 'sm:col-span-2 lg:col-span-4' : ''}`}>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.03em] text-slate-500">
                  {label}
                  {changedKeys.has(SNAPSHOT_KEY[key]) && <span className="rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-bold normal-case tracking-normal text-brand-700">Updated</span>}
                </p>
                <p className="break-words text-[13px] font-semibold leading-5 text-navy-900">{displayProfileValue(key, profile?.[key]) || '—'}</p>
                {changedKeys.has(SNAPSHOT_KEY[key]) && (key !== 'city' && key !== 'district' && key !== 'region' && key !== 'postal_code') && <p className="break-words text-[11px] text-slate-400">Was: {oldValue(SNAPSHOT_KEY[key]) || '—'}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="overflow-hidden rounded-lg border border-[#d8e0e9] bg-white">
        <h3 className="flex items-center gap-1.5 border-b border-[#d8e0e9] bg-[#eef2fb] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">
          <Paperclip size={13} className="text-brand-600" /> Supporting documents
          {documents !== null && <span className="ml-auto rounded-full bg-white px-2 py-px text-[10.5px] font-bold normal-case tracking-normal text-slate-600 ring-1 ring-[#d8e0e9]">{uploadedCount} of {documentTypes.length} uploaded</span>}
        </h3>
        {documents === null ? (
          <p className="px-3 py-2.5 text-xs text-slate-500">Loading documents…</p>
        ) : (
          <ul className="grid gap-2 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {documentTypes.map(({ key, label }) => {
              const files = documentItems.filter((item) => item.type === key)
              const uploaded = files.length > 0
              return (
                <li key={key} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 ${uploaded ? 'border-emerald-200 bg-emerald-50/50' : 'border-dashed border-slate-200 bg-slate-50/60'}`}>
                  <span className={`grid size-4.5 shrink-0 place-items-center rounded-full ${uploaded ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {uploaded ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : <Minus size={11} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[12.5px] font-bold leading-5 ${uploaded ? 'text-navy-900' : 'text-slate-500'}`} title={label}>{label}</span>
                  {uploaded ? files.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => setPreviewId(item.id)} title={item.name} aria-label={`View ${label}: ${item.name}`} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-transparent! p-0! px-1.5! min-h-0! text-xs! font-bold! text-brand-700 shadow-none! transition hover:bg-white! focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40">
                      <Eye size={13} aria-hidden="true" /> View{files.length > 1 ? ` ${index + 1}` : ''}
                    </button>
                  )) : <span className="shrink-0 text-[11px] font-semibold text-slate-400">Not provided</span>}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <DocumentPreview items={documentItems} activeId={previewId} onChange={setPreviewId} onClose={() => setPreviewId(null)} />
    </div>
  )
}
