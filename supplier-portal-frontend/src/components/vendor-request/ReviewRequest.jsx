import { useState } from 'react'
import { ArrowLeft, Edit3, Eye, FileText, Send } from 'lucide-react'
import Button from '../common/Button'
import Checkbox from '../common/Checkbox'
import Loader from '../common/Loader'
import { joinPhone } from '../../data/countryCodes'
import { documentTypes } from '../../data/documentTypes'
import { newDocumentId, uploadedDocumentId } from '../../utils/documentPreview'
import { displayValue, maskAadhaar, maskAccountNumber } from '../../utils/formatters'
import TermsPolicyModal from './TermsPolicyModal'
import { isCompanyType } from '../../data/vendorTypes'

// Udyam applies to a registered MSME, CIN to an incorporated entity (or one that already has a value): no empty rows for the rest.
const appliesToVendor = (key, values) =>
  (key !== 'udyamNumber' || values.msmeStatus === 'Registered') && (key !== 'cin' || isCompanyType(values.vendorType) || Boolean(values.cin))

const sections = [
  {
    title: 'Customer information',
    step: 1,
    wide: true,
    fields: [
      ['GSTIN', 'gstin'], ['Legal name', 'vendorLegalName'], ['PAN / Tax ID', 'pan'], ['Aadhaar number', 'aadhaar', 'aadhaar'],
      ['Phone number', 'vendorPhone'], ['Email address', 'vendorEmail'], ['Customer type', 'vendorType'],
      ['Currency', 'currency'],
      ['Registration no.', 'registrationNumber'], ['MSME status', 'msmeStatus'], ['Relationship manager', 'assignedRm'], ['Udyam no.', 'udyamNumber'],
    ],
  },
  {
    title: 'Demat account details',
    step: 1,
    optional: true,
    fields: [['Demat ID', 'dematId'], ['DP ID', 'dpId'], ['BO ID', 'boId'], ['Depository', 'depository']],
  },
  {
    title: 'Address details',
    step: 2,
    fields: [
      ['Address', 'registeredAddress1'], ['District', 'registeredDistrict'], ['City', 'registeredCity'],
      ['State', 'registeredState'], ['Postal code', 'registeredPostalCode'], ['CIN', 'cin'],
    ],
  },
  {
    title: 'Bank details',
    step: 3,
    fields: [
      ['Account holder', 'accountHolderName'], ['Bank', 'bankName'], ['Branch', 'branchName'],
      ['Account number', 'accountNumber', true], ['IFSC', 'ifsc'],
    ],
  },
]

// existingDocuments is what is already uploaded ({ [typeKey]: [{ original_name }] }); `documents` are new files picked in this
// session, which replace it. unresolvedCount is how many flagged items of a returned application are still open.
export default function ReviewRequest({ values, documents = {}, existingDocuments = {}, onPreview, register, setValue, errors, onEdit, onBack, submitting, declarationsComplete, isResubmission = false, unresolvedCount = 0 }) {
  const [termsOpen, setTermsOpen] = useState(false)

  const handleTermsClick = (event) => {
    if (values.termsDeclaration) return
    event.preventDefault()
    setTermsOpen(true)
  }

  const acceptTerms = () => {
    setValue('termsDeclaration', true, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
    setTermsOpen(false)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        {sections.filter((section) => !section.optional || section.fields.some(([, key]) => values[key])).map((section) => (
          <section key={section.title} className={`section-card overflow-hidden ${section.wide ? 'xl:col-span-2' : ''}`}>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <h3 className="text-sm font-extrabold text-navy-900">{section.title}</h3>
              <button
                type="button"
                onClick={() => onEdit(section.step)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-brand-600 transition hover:bg-brand-50 hover:text-brand-700"
              >
                <Edit3 size={14} /> Edit
              </button>
            </div>
            <dl className={`grid grid-cols-1 gap-x-5 gap-y-3 p-4 sm:grid-cols-2 ${section.wide ? 'xl:grid-cols-4' : ''}`}>
              {section.fields.filter(([, key]) => appliesToVendor(key, values)).map(([label, key, masked]) => (
                <div key={key} className={key.includes('Address') ? 'sm:col-span-2' : ''}>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                  <dd className="mt-0.5 break-words text-xs font-semibold text-slate-800">
                    {masked ? (masked === 'aadhaar' ? maskAadhaar(values[key]) : maskAccountNumber(values[key])) : displayValue(key === 'vendorPhone' ? joinPhone(values.vendorPhoneCode, values.vendorPhone) : values[key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="section-card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <h3 className="text-sm font-extrabold text-navy-900">Supporting documents</h3>
            <button
              type="button"
              onClick={() => onEdit(3)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-brand-600 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <Edit3 size={14} /> Edit
            </button>
          </div>
          {/* As many columns as fit (never narrower than 15rem), so it reads the same on a small laptop as on a wide monitor. */}
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3 p-4">
            {documentTypes.map(({ key, label, max }) => (
              <div key={key} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                <dd className="mt-1.5 min-w-0 text-xs font-semibold text-slate-800">
                  {documents[key]?.length || existingDocuments[key]?.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {[
                        // A one-file type shows its not-yet-uploaded file instead of the uploaded one (it replaces it); several-file types show both.
                        ...(max > 1 || !documents[key]?.length ? (existingDocuments[key] || []).map((file) => ({ id: uploadedDocumentId(file), name: file.original_name, uploaded: true, canOpen: Boolean(file.blob_name) })) : []),
                        ...(documents[key] || []).map((file, index) => ({ id: newDocumentId(key, index), name: file.name, uploaded: false })),
                      ].map((entry) => (
                        <li key={entry.id} className="flex min-w-0 items-center gap-2 rounded-md bg-slate-50 px-2 py-1">
                          <FileText size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1 basis-0 truncate" title={entry.name}>{entry.name}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${entry.uploaded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{entry.uploaded ? 'Uploaded' : 'Not uploaded'}</span>
                          {onPreview && (entry.uploaded ? entry.canOpen : true) && (
                            <button type="button" onClick={() => onPreview(entry.id)} aria-label={`Preview ${entry.name}`} title="Preview" className="grid size-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-[#eef2fb] hover:text-brand-700">
                              <Eye size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="section-card p-4">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <h3 className="text-base font-extrabold text-navy-900">Confirm declarations</h3>
          <p className="text-xs text-slate-500">All confirmations are required to submit this request.</p>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Checkbox label="The provided information is accurate." name="accurateDeclaration" register={register} error={errors.accurateDeclaration} />
            <Checkbox
              label="I agree to the supplier onboarding terms and policies."
              description="Open and read the policy to accept."
              name="termsDeclaration"
              register={register}
              error={errors.termsDeclaration}
              onClick={handleTermsClick}
            />
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={onBack}><ArrowLeft size={17} /> Back</Button>
            <Button type="submit" disabled={!declarationsComplete || submitting || unresolvedCount > 0}>
              {submitting ? <><Loader /> Sending…</> : <><Send size={17} /> {isResubmission ? 'Resubmit application' : 'Send request'}</>}
            </Button>
          </div>
        </div>
        {unresolvedCount > 0 && (
          <p role="status" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            {unresolvedCount} {unresolvedCount === 1 ? 'item' : 'items'} sent back by our team {unresolvedCount === 1 ? 'is' : 'are'} still waiting for your update or confirmation. Go back and fix {unresolvedCount === 1 ? 'it' : 'them'} to resubmit.
          </p>
        )}
      </section>
      <TermsPolicyModal open={termsOpen} onClose={() => setTermsOpen(false)} onAccept={acceptTerms} />
    </div>
  )
}
