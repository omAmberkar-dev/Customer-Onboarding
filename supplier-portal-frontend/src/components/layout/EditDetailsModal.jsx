import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Send, X } from 'lucide-react'
import { createUpdateRequest } from '../../api/vendorApi'
import Button from '../common/Button'
import Loader from '../common/Loader'
import PhoneField from '../common/PhoneField'
import { joinPhone, phoneRuleFor, splitPhone } from '../../data/countryCodes'
import usePincodeAutofill from '../../hooks/usePincodeAutofill'
import { aadhaarDigits, maskAadhaarInput } from '../../utils/formatters'
import { isCompanyType } from '../../data/vendorTypes'
import { LOCKED_KEYS, displayProfileValue, isRegisteredMsme, requiredKeys, sameValue, sections, toDraft, toUpdatePayload } from './profileFields'

const fieldBox = 'mt-1 h-8 min-h-8 w-full rounded-md px-2.5 py-1 text-[13px] leading-5'
const wideKeys = new Set(['vendor_legal_name', 'street', 'account_holder_name'])
const labelClass = 'flex h-4 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500'

function SectionHeading({ icon: Icon, title }) {
  return (
    <h3 className="flex items-center gap-2 border-b border-[#d8e0e9] bg-[#f7f9fc] px-6 py-2 text-[13px] font-bold text-navy-900">
      <Icon size={15} className="text-brand-600" /> {title}
    </h3>
  )
}

// Edit details: the vendor's current details sit read-only on the left and an editable copy on the
// right, laid out as the same sections and the same two-field rows on both sides so each change can
// be checked against what it replaces. Every field has the same height on both sides, which keeps the
// two halves level as you scroll. A changed field is highlighted.
export default function EditDetailsModal({ open, profile, onClose, onSent }) {
  const [draft, setDraft] = useState(() => toDraft(profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  // The phone number is kept in the draft as one value ("+919998832823"); the code is also held on its own so
  // choosing a code before typing a number is not forgotten.
  const [phoneCode, setPhoneCode] = useState(() => splitPhone(profile?.contact_no).code)

  useEffect(() => {
    if (!open) return undefined
    setDraft(toDraft(profile))
    setPhoneCode(splitPhone(profile?.contact_no).code)
    setError('')
    setFieldErrors({})
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // Reset only when the popup opens; a background profile refresh must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const changedKeys = useMemo(
    () => new Set(Object.keys(draft).filter((key) => !sameValue(draft[key], profile?.[key], key))),
    [draft, profile],
  )

  // City and District follow the PIN code. A PIN that is already on record is locked, so this only matters
  // for a profile that never had one.
  usePincodeAutofill({
    pincode: String(draft.postal_code ?? '').trim(),
    enabled: open && !(LOCKED_KEYS.has('postal_code') && String(profile?.postal_code ?? '').trim() !== ''),
    getCurrent: () => ({ city: draft.city, district: draft.district }),
    apply: (fill) => setDraft((current) => ({ ...current, ...fill })),
  })

  if (!open || !profile) return null

  const phoneNumber = draft.contact_no.startsWith(phoneCode) ? draft.contact_no.slice(phoneCode.length) : ''

  const setValue = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => (current[key] ? { ...current, [key]: '' } : current))
  }
  const setPhone = (code, number) => {
    setPhoneCode(code)
    setValue('contact_no', joinPhone(code, number))
  }

  // Only a phone or Aadhaar the vendor actually changed is checked, so an old record is never blocked by itself.
  const validate = () => {
    const problems = {}
    if (changedKeys.has('contact_no') && !phoneRuleFor(phoneCode).pattern.test(phoneNumber)) problems.contact_no = phoneRuleFor(phoneCode).message
    if (changedKeys.has('aadhaar_no') && aadhaarDigits(draft.aadhaar_no) && !/^[2-9]\d{11}$/.test(aadhaarDigits(draft.aadhaar_no))) problems.aadhaar_no = 'Enter a valid 12-digit Aadhaar number'
    return problems
  }

  const submit = async (event) => {
    event.preventDefault()
    if (changedKeys.size === 0) {
      setError('Change at least one detail to send a request.')
      return
    }
    const problems = validate()
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems)
      setError(Object.values(problems)[0])
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = toUpdatePayload(isRegisteredMsme(draft) ? draft : { ...draft, udyam_number: '' }, profile)
      await createUpdateRequest(profile.vendor_id, payload)
      onSent()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to send the update request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form onSubmit={submit} className="flex h-[90dvh] max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Edit details">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-6 py-3.5">
          <div>
            <h2 className="text-[17px] font-bold text-[#000000]">Edit details</h2>
            <p className="mt-1 text-xs text-[#5f5f5f]">Update the details on the right. Your changes are sent for approval, and your current details stay active until then.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto text-[13px]">
          <div className="sticky top-0 z-10 hidden grid-cols-2 border-b border-[#d8e0e9] bg-white md:grid">
            <div className="bg-white px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#5f5f5f]">
              Current details <span className="ml-1 font-medium normal-case tracking-normal text-[#8a94a6]">(read only)</span>
            </div>
            <div className="border-l-2 border-[#b3c3e4] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#0046dc]">
              New details <span className="ml-1 font-medium normal-case tracking-normal text-[#8a94a6]">(<span className="text-red-600">*</span> required)</span>
            </div>
          </div>

          {sections.map(({ title, icon: Icon, fields }) => {
            const visible = fields.filter(
              ([key]) =>
                (key !== 'udyam_number' || isRegisteredMsme(draft) || String(profile.udyam_number ?? '').trim() !== '') &&
                (key !== 'cin' || isCompanyType(draft.vendor_type) || String(profile.cin ?? '').trim() !== ''),
            )
            return (
              <section key={title}>
                <div className="grid md:grid-cols-2">
                  <div>
                    <SectionHeading icon={Icon} title={title} />
                    <div className="grid grid-cols-2 content-start gap-x-3 gap-y-2.5 px-6 py-3.5">
                    {visible.map(([key, label]) => {
                      const changed = changedKeys.has(key)
                      return (
                        <div key={key} className={wideKeys.has(key) ? 'col-span-2' : ''} data-changed={changed || undefined}>
                          <p className={labelClass}>{label}</p>
                          <p title={displayProfileValue(key, profile[key])} className="mt-1 flex h-8 items-center truncate rounded-md border border-[#d8e0e9] bg-[#f6f8fb] px-2.5 text-[13px] font-semibold leading-5 text-navy-900">
                            <span className="truncate">{displayProfileValue(key, profile[key]) || '—'}</span>
                          </p>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                  <div className="border-t border-[#d8e0e9] md:border-l-2 md:border-t-0 md:border-[#b3c3e4]">
                    <SectionHeading icon={Icon} title={title} />
                    <div className="grid grid-cols-2 content-start gap-x-3 gap-y-2.5 px-6 py-3.5">
                    {visible.map(([key, label, type = 'text', options]) => {
                      const changed = changedKeys.has(key)
                      const locked = LOCKED_KEYS.has(key) && String(profile[key] ?? '').trim() !== ''
                      const required = requiredKeys.has(key) || (key === 'udyam_number' && isRegisteredMsme(draft))
                      const highlight = changed ? ' border-[#0046dc]! bg-[#eef2fb]! ring-2 ring-[#0046dc]/15' : ''
                      return (
                        <div key={key} className={wideKeys.has(key) ? 'col-span-2' : ''}>
                          <label htmlFor={`edit-${key}`} className={labelClass}>
                            <span>{label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}</span>
                            {changed && <span className="rounded-full bg-[#0046dc] px-1.5 text-[9px] font-bold normal-case leading-4 tracking-normal text-white">Changed</span>}
                          </label>
                          {locked ? (
                            <input id={`edit-${key}`} className={`app-field app-field--locked ${fieldBox}`} value={String(profile[key])} readOnly disabled aria-readonly="true" title="This detail can't be changed" />
                          ) : key === 'contact_no' ? (
                            <PhoneField
                              id={`edit-${key}`}
                              codeId={`edit-${key}-code`}
                              code={phoneCode}
                              onCodeChange={(code) => setPhone(code, phoneNumber.slice(0, phoneRuleFor(code).max))}
                              inputProps={{ value: phoneNumber, onChange: (event) => setPhone(phoneCode, event.target.value) }}
                              onNumberReplace={(digits) => setPhone(phoneCode, digits)}
                              invalid={Boolean(fieldErrors[key])}
                              required={required}
                              controlClassName={`${fieldBox}${highlight}`}
                            />
                          ) : key === 'aadhaar_no' ? (
                            <input
                              id={`edit-${key}`}
                              className={`app-field tabular-nums tracking-wider ${fieldBox}${highlight}`}
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="XXXX XXXX XXXX"
                              maxLength={14}
                              aria-invalid={Boolean(fieldErrors[key])}
                              value={draft[key]}
                              onChange={(event) => setValue(key, maskAadhaarInput(event.target))}
                            />
                          ) : type === 'select' ? (
                            <select id={`edit-${key}`} className={`app-field ${fieldBox}${highlight}`} value={draft[key]} onChange={(event) => setValue(key, event.target.value)} required={required}>
                              <option value="">Select an option</option>
                              {(draft[key] && !options.includes(draft[key]) ? [draft[key], ...options] : options).map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          ) : (
                            <input id={`edit-${key}`} type={type} className={`app-field ${fieldBox}${highlight}`} value={draft[key]} onChange={(event) => setValue(key, event.target.value)} required={required} />
                          )}
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 text-[13px]">
          <div className="min-w-0 text-xs">
            {error ? (
              <p role="alert" className="flex items-center gap-1.5 font-semibold text-red-700"><AlertCircle size={14} /> {error}</p>
            ) : (
              <p className="text-[#5f5f5f]">{changedKeys.size === 0 ? 'No changes yet.' : `${changedKeys.size} detail${changedKeys.size === 1 ? '' : 's'} changed.`}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="min-h-9! px-4! py-1.5!" type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button className="min-h-9! px-4! py-1.5!" type="submit" disabled={saving || changedKeys.size === 0}>
              {saving ? <><Loader /> Sending...</> : <><Send size={16} /> Send request</>}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  )
}
