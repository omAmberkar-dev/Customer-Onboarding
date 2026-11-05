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
import FormSection from './FormSection'
import { useFlags } from '../../context/flags-context'
import { cinApplies } from '../../data/vendorTypes'

// Udyam applies to a registered MSME, CIN to every other (or one that already has a value): no empty rows for the rest.
const appliesToVendor = (key, values) =>
  (key !== 'udyamNumber' || values.msmeStatus === 'Registered') && (key !== 'cin' || cinApplies(values.msmeStatus) || Boolean(values.cin))

const sections = [
  {
    title: 'Customer information',
    step: 1,
    fields: [
      ['GSTIN', 'gstin'], ['Legal name', 'vendorLegalName'], ['PAN / Tax ID', 'pan'], ['Aadhaar number', 'aadhaar', 'aadhaar'],
      ['Phone number', 'vendorPhone'], ['Email address', 'vendorEmail'], ['Customer type', 'vendorType'],
      ['Currency', 'currency'],
      ['Registration no.', 'registrationNumber'], ['MSME status', 'msmeStatus'], ['CIN', 'cin'], ['Relationship manager', 'assignedRm'], ['Udyam no.', 'udyamNumber'],
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
      ['State', 'registeredState'], ['Postal code', 'registeredPostalCode'],
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
// Laid out as LAS's review step: one card per section with Edit in its header, the values three to a row, then the
// declarations with Back and the submit button.
export default function ReviewRequest({ values, documents = {}, existingDocuments = {}, onPreview, register, setValue, errors, onEdit, onBack, submitting, declarationsComplete, isResubmission = false, unresolvedCount = 0 }) {
  const [termsOpen, setTermsOpen] = useState(false)
  // A value sent back for correction and still not dealt with is marked here too.
  const { flags } = useFlags()

  const handleTermsClick = (event) => {
    if (values.termsDeclaration) return
    event.preventDefault()
    setTermsOpen(true)
  }

  const acceptTerms = () => {
    setValue('termsDeclaration', true, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
    setTermsOpen(false)
  }

  const edit = (step, title) => (
    <button type="button" onClick={() => onEdit(step)} className="vr-edit" aria-label={`Edit ${title.toLowerCase()}`}>
      <Edit3 size={13} aria-hidden="true" /> Edit
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      {sections.filter((section) => !section.optional || section.fields.some(([, key]) => values[key])).map((section) => (
        <FormSection key={section.title} title={section.title} action={edit(section.step, section.title)}>
          <dl className="vr-review">
            {section.fields.filter(([, key]) => appliesToVendor(key, values)).map(([label, key, masked]) => (
              <div key={key} className={`${key.includes('Address') ? 'wide' : ''} ${flags[key]?.status === 'open' ? 'flagged' : ''}`}>
                <dt>{label}{flags[key]?.status === 'open' && <span className="sr-only"> (to correct)</span>}</dt>
                <dd>
                  {masked ? (masked === 'aadhaar' ? maskAadhaar(values[key]) : maskAccountNumber(values[key])) : displayValue(key === 'vendorPhone' ? joinPhone(values.vendorPhoneCode, values.vendorPhone) : values[key])}
                </dd>
              </div>
            ))}
          </dl>
        </FormSection>
      ))}
      <FormSection title="Supporting documents" action={edit(3, 'Supporting documents')}>
        <dl className="vr-review-docs">
          {documentTypes.map(({ key, label, max }) => (
            <div key={key} className="min-w-0">
              <dt className="mb-0.5 text-[11px] text-slate-500">{label}</dt>
              <dd className="m-0 min-w-0 text-xs font-semibold text-slate-800">
                {documents[key]?.length || existingDocuments[key]?.length ? (
                  <ul className="flex flex-col gap-1">
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
      </FormSection>

      <FormSection title="Confirm declarations" description="All confirmations are required to submit this request.">
        <div className="vr-declare">
          <div className="vr-declare-checks">
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
          <div className="vr-actions">
            <Button type="button" variant="secondary" className="vr-btn" onClick={onBack}><ArrowLeft size={16} /> Back</Button>
            <Button type="submit" className="vr-btn" disabled={!declarationsComplete || submitting || unresolvedCount > 0}>
              {submitting ? <><Loader /> Sending…</> : <><Send size={16} /> {isResubmission ? 'Resubmit for review' : 'Send request'}</>}
            </Button>
          </div>
        </div>
        {unresolvedCount > 0 && (
          <p role="status" className="vr-alert mt-2.5">
            {unresolvedCount} {unresolvedCount === 1 ? 'item' : 'items'} sent back by our team {unresolvedCount === 1 ? 'is' : 'are'} still waiting for your update or confirmation. Go back and fix {unresolvedCount === 1 ? 'it' : 'them'} to resubmit.
          </p>
        )}
      </FormSection>
      <TermsPolicyModal open={termsOpen} onClose={() => setTermsOpen(false)} onAccept={acceptTerms} />
    </div>
  )
}
