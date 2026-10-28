import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, FileCheck2, Landmark, Save, ShieldCheck } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Button from '../components/common/Button'
import FormError from '../components/common/FormError'
import Loader from '../components/common/Loader'
import Modal from '../components/common/Modal'
import FormProgress from '../components/vendor-request/FormProgress'
import ContactDetails from '../components/vendor-request/ContactDetails'
import VendorInformation from '../components/vendor-request/VendorInformation'
import DematDetails from '../components/vendor-request/DematDetails'
import AddressDetails from '../components/vendor-request/AddressDetails'
import BankDetails from '../components/vendor-request/BankDetails'
import ReviewRequest from '../components/vendor-request/ReviewRequest'
import ReturnedBanner from '../components/vendor-request/ReturnedBanner'
import SupportingDocuments from '../components/vendor-request/SupportingDocuments'
import DocumentPreview from '../components/vendor-request/DocumentPreview'
import { documentPreviewItems, fileKey } from '../utils/documentPreview'
import { documentTypes } from '../data/documentTypes'
import useVendorRequest from '../hooks/useVendorRequest'
import useAuth from '../hooks/useAuth'
import useIdentityVerification from '../hooks/useIdentityVerification'
import useDematVerification from '../hooks/useDematVerification'
import { FORM_STEPS, PAN_TAKEN_MESSAGE, STEP_FIELDS } from '../utils/constants'
import { KEY_BY_FORM_FIELD, buildFlags, stepOfFlag } from '../utils/rejectionFields'
import { STAGES } from '../utils/stages'
import { isValidPhone } from '../data/countryCodes'
import { cinApplies } from '../data/vendorTypes'
import { FlagsContext } from '../context/flags-context'
import useAutosave from '../hooks/useAutosave'
import { checkPanExists, deleteMyDocument, getMyDocuments, saveOnboardingDraft, submitOnboarding, uploadVendorDocuments } from '../api/vendorApi'

const trustPoints = [
  { icon: ShieldCheck, label: 'Secure verification' },
  { icon: FileCheck2, label: 'Invoice-ready profile' },
  { icon: Landmark, label: 'Bank detail validation' },
]

const GST_MANAGED_FIELDS = ['vendorLegalName', 'registeredAddress1', 'registeredState', 'registeredPostalCode']
const normalise = (value) => String(value ?? '').trim()
const documentLabel = (key) => documentTypes.find((type) => type.key === key)?.label || key

// The vendor's onboarding application. A new vendor fills it in after signing up (progress is saved to their account
// as they go); a vendor whose application was returned sees the flagged fields highlighted, with the reasons.
export default function VendorRequestPage() {
  const navigate = useNavigate()
  const { profile, logout, refreshProfile } = useAuth()
  const returned = profile.stage === STAGES.returned
  const rejection = returned ? profile.rejection : null

  const form = useVendorRequest(profile)
  const { register, watch, getValues, setValue, setError, clearErrors, trigger, handleSubmit, initialValues, formState: { errors } } = form
  const flagDefs = useMemo(() => buildFlags(rejection), [rejection])
  const hasFlags = Object.keys(flagDefs.fields).length + Object.keys(flagDefs.documents).length > 0

  const [step, setStep] = useState(1)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [exitOpen, setExitOpen] = useState(false)
  const [panTaken, setPanTaken] = useState(false)
  const [checkingPan, setCheckingPan] = useState(false)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [gstLockedFields, setGstLockedFields] = useState(GST_MANAGED_FIELDS)
  // The GSTIN verification lives here, not in step 1, so it is still shown as verified when you come back to that step.
  // A saved GSTIN with its details filled in was verified earlier, so it starts out verified.
  const [gstLookup, setGstLookup] = useState(() => ({
    loading: false,
    gstin: profile.gstin && profile.vendor_legal_name ? String(profile.gstin).trim().toUpperCase() : '',
    message: 'GSTIN verified. Details are locked.',
  }))
  // New files picked in this session ({ [typeKey]: File[] }), and what is already uploaded for the application.
  const [documents, setDocuments] = useState({})
  const [existingDocuments, setExistingDocuments] = useState({})
  const [previewId, setPreviewId] = useState(null)
  // A picked file goes to storage straight away. `documents` then only holds the files that are not uploaded yet (uploading or failed);
  // `uploadState` is { [fileKey]: { status: 'uploading' | 'failed', error } }. Uploads of one type run one after another.
  const [uploadState, setUploadState] = useState({})
  const [uploadedTypes, setUploadedTypes] = useState([])
  const uploadChain = useRef({})
  const listSeq = useRef(0) // numbers the uploaded-list answers so a late, older one can be ignored
  const appliedSeq = useRef(0)
  const uploading = Object.values(uploadState).some((entry) => entry.status === 'uploading')
  const previewItems = useMemo(() => documentPreviewItems(documents, existingDocuments), [documents, existingDocuments])
  // Flagged items the vendor checked and says are correct as entered: form field names, and `doc:<type>` for documents.
  const [confirmed, setConfirmed] = useState(() => new Set())

  const values = watch()
  // Progress is also saved in the background a moment after the vendor stops typing. It pauses while a manual save or the submit runs.
  const autosave = useAutosave({
    value: values,
    save: saveOnboardingDraft,
    enabled: !saving && !submitting && !exitOpen,
    onSaved: () => setSavedAt(new Date()),
  })
  const identity = useIdentityVerification(values, returned ? initialValues : null, !returned)
  const demat = useDematVerification(form)
  const contactReady = isValidPhone(values.vendorPhoneCode, values.vendorPhone)

  // A registered MSME gives no CIN: one left over from before the MSME status changed is dropped, unless the reviewer flagged it
  // (then the field stays and the vendor can fix it).
  useEffect(() => {
    if (values.cin && !cinApplies(values.msmeStatus) && !flagDefs.fields.cin) setValue('cin', '', { shouldDirty: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.msmeStatus])
  const currentFields = STEP_FIELDS[step - 1] || []
  const errorCount = currentFields.filter((name) => errors[name]).length
  const declarationsComplete = values.accurateDeclaration && values.termsDeclaration

  useEffect(() => {
    getMyDocuments().then(setExistingDocuments).catch(() => {})
  }, [])

  // --- Returned application: where each flagged item stands --------------------------------------------------
  const fieldChanged = (name) => (name === 'vendorPhone'
    ? normalise(values.vendorPhone) !== normalise(initialValues.vendorPhone) || values.vendorPhoneCode !== initialValues.vendorPhoneCode
    : normalise(values[name]) !== normalise(initialValues[name]))

  const flags = {}
  Object.entries(flagDefs.fields).forEach(([name, def]) => {
    flags[name] = { ...def, status: confirmed.has(name) ? 'confirmed' : fieldChanged(name) || def.fixed ? 'changed' : 'open' }
  })
  const documentFlags = {}
  Object.entries(flagDefs.documents).forEach(([type, def]) => {
    documentFlags[type] = { ...def, status: confirmed.has(`doc:${type}`) ? 'confirmed' : documents[type]?.length || uploadedTypes.includes(type) || def.fixed ? 'changed' : 'open' }
  })

  const flaggedItems = [
    ...Object.entries(flags).map(([name, flag]) => ({ key: name, name, label: flag.label, reasons: flag.reasons, status: flag.status, step: stepOfFlag(name, false), document: false })),
    ...Object.entries(documentFlags).map(([type, flag]) => ({ key: `doc:${type}`, name: type, label: documentLabel(type), reasons: flag.reasons, status: flag.status, step: stepOfFlag(type, true), document: true })),
  ].sort((a, b) => a.step - b.step)
  const unresolvedCount = flaggedItems.filter((item) => item.status === 'open').length

  const flagsContext = useMemo(() => ({
    flags,
    confirm: (name) => setConfirmed((current) => new Set(current).add(name)),
    unconfirm: (name) => setConfirmed((current) => { const next = new Set(current); next.delete(name); return next }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [JSON.stringify(flags)])

  const confirmDocument = (type) => setConfirmed((current) => new Set(current).add(`doc:${type}`))
  const unconfirmDocument = (type) => setConfirmed((current) => { const next = new Set(current); next.delete(`doc:${type}`); return next })

  // Takes the vendor to a flagged field: the right step first, then scroll to it and draw the eye with a short pulse.
  const pendingFocus = useRef(null)
  const focusItem = useCallback((item) => {
    const element = document.getElementById(item.document ? `doc-${item.name}` : item.name)
    if (!element) return false
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (!item.document) element.focus({ preventScroll: true })
    element.classList.add('flag-pulse')
    setTimeout(() => element.classList.remove('flag-pulse'), 1500)
    return true
  }, [])

  const goToItem = (item) => {
    if (item.step !== step) {
      pendingFocus.current = item
      setStep(item.step)
    } else {
      focusItem(item)
    }
  }

  useEffect(() => {
    if (!pendingFocus.current) return
    const item = pendingFocus.current
    pendingFocus.current = null
    setTimeout(() => focusItem(item), 80)
  }, [step, focusItem])

  // A returned application opens on the first step that has something flagged, scrolled to the first open item.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current || !hasFlags) return
    startedRef.current = true
    const first = flaggedItems.find((item) => item.status === 'open') || flaggedItems[0]
    if (first) goToItem(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFlags])

  // --- Saving ---------------------------------------------------------------------------------------------------
  const dropPending = (type, files) => {
    const keys = files.map((file) => fileKey(type, file))
    setDocuments((current) => {
      const left = (current[type] || []).filter((file) => !files.includes(file))
      const next = { ...current }
      if (left.length > 0) next[type] = left
      else delete next[type]
      return next
    })
    setUploadState((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[key])
      return next
    })
  }

  const uploadFiles = (type, files) => {
    const keys = files.map((file) => fileKey(type, file))
    setUploadState((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, { status: 'uploading' }])) }))
    const multiple = (documentTypes.find((item) => item.key === type)?.max || 1) > 1
    const run = async () => {
      try {
        await uploadVendorDocuments(profile.vendor_id, { [type]: files }, { append: multiple })
      } catch (err) {
        const message = err.message || 'The upload failed. Please try again.'
        setUploadState((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, { status: 'failed', error: message }])) }))
        return
      }
      // The row keeps showing "Uploading…" until the refreshed uploaded list is ready; then the two are swapped in ONE update
      // (these state changes are batched), so there is never a moment with neither row.
      const mine = ++listSeq.current
      let fresh = null
      for (let attempt = 0; attempt < 2 && !fresh; attempt += 1) fresh = await getMyDocuments().catch(() => null)
      if (!fresh) {
        // The file is stored but the list could not be read: show it from what we know rather than losing the row.
        fresh = { ...existingDocuments }
        const known = files.map((file) => ({ type, original_name: file.name, size: file.size }))
        fresh[type] = multiple ? [...(existingDocuments[type] || []), ...known] : known
      }
      if (mine >= appliedSeq.current) { appliedSeq.current = mine; setExistingDocuments(fresh) } // a late older answer never overwrites a newer one
      setUploadedTypes((current) => (current.includes(type) ? current : [...current, type]))
      dropPending(type, files)
    }
    uploadChain.current[type] = (uploadChain.current[type] || Promise.resolve()).then(run)
  }

  // A file the vendor picked (already checked for type and size by the slot): kept in the row and uploaded now.
  const pickDocuments = (type, incoming) => {
    const multiple = (documentTypes.find((item) => item.key === type)?.max || 1) > 1
    if (!multiple) setUploadState((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${type}:`))))
    setDocuments((current) => ({ ...current, [type]: multiple ? [...(current[type] || []), ...incoming] : incoming }))
    uploadFiles(type, incoming)
  }
  const removePicked = (type, file) => dropPending(type, [file])
  const retryUpload = (type, file) => uploadFiles(type, [file])

  const lockGstFields = (fields) => {
    setGstLockedFields((current) => [...new Set([...current, ...fields])])
  }

  // Saves the form (and any newly picked documents) to the vendor's account. Throws on failure.
  const persist = async () => {
    const toSave = getValues()
    await saveOnboardingDraft(toSave)
    autosave.markSaved(toSave)
    setSavedAt(new Date())
  }

  const saveDraft = async () => {
    setSaving(true)
    setSubmitError('')
    try { await persist() } catch (err) { setSubmitError(err.message || 'Unable to save your progress.') } finally { setSaving(false) }
  }

  const saveAndExit = async () => {
    setSaving(true)
    try {
      await persist()
      logout()
      navigate('/', { replace: true })
    } catch (err) {
      setExitOpen(false)
      setSubmitError(err.message || 'Unable to save your progress, so you were not logged out.')
    } finally {
      setSaving(false)
    }
  }

  const nextStep = async () => {
    setAttempted(true)
    setSubmitError('')
    const valid = await trigger(currentFields, { shouldFocus: true })
    if (!valid) return

    if (step === 1) {
      if (identity.blocked) {
        setSubmitError(`Verify your ${identity.pending.map((service) => ({ PAN: 'PAN', GSTIN: 'GSTIN', AADHAAR: 'Aadhaar number' })[service]).join(', ')} to continue.`)
        return
      }
      setCheckingDuplicates(true)
      try {
        const normalizedPan = values.pan.trim().toUpperCase()
        const panExists = await checkPanExists(normalizedPan)
        setPanTaken(panExists)
        form.takenRef.current = { ...form.takenRef.current, pan: panExists ? normalizedPan : '' }
        if (panExists) {
          setError('pan', { type: 'manual', message: PAN_TAKEN_MESSAGE })
          return
        }
        clearErrors('pan')
      } catch {
        setSubmitError('PAN availability could not be verified. Please try again.')
        return
      } finally {
        setCheckingDuplicates(false)
      }
    }

    // Every step saves what has been entered so far, so the vendor can leave and pick up where they stopped.
    setSaving(true)
    try {
      await persist()
    } catch (err) {
      setSubmitError(err.message || 'Unable to save your progress. Please try again.')
      return
    } finally {
      setSaving(false)
    }
    setAttempted(false)
    setStep((current) => Math.min(current + 1, 4))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const previousStep = () => {
    setAttempted(false)
    setStep((current) => Math.max(current - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitRequest = handleSubmit(async (data) => {
    if (!declarationsComplete || unresolvedCount > 0) return
    if (identity.blocked) {
      setSubmitError('Go back to the customer information step and verify the PAN, GSTIN and Aadhaar number you entered.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      // Documents already went up when they were picked; a file that failed stays marked in its row until the vendor retries it.
      const confirmedKeys = [...confirmed].map((key) => (key.startsWith('doc:') ? `doc_${key.slice(4)}` : KEY_BY_FORM_FIELD[key])).filter(Boolean)
      await submitOnboarding(data, confirmedKeys)
      await refreshProfile()
      navigate('/application-status', { replace: true, state: { submitted: true } })
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit your application. Please try again.')
      setSubmitting(false)
    }
  }, () => setAttempted(true))

  const renderStep = () => {
    const props = { register, errors, watch, setValue, setError, clearErrors, lockedFields: gstLockedFields, takenRef: form.takenRef }
    if (step === 1) {
      return (
        <div className="space-y-3">
          <ContactDetails {...props} />
          <VendorInformation
            {...props}
            disabled={!contactReady}
            gstLookup={gstLookup}
            setGstLookup={setGstLookup}
            onPanTakenChange={setPanTaken}
            onPanCheckingChange={setCheckingPan}
            onGstLookupSuccess={lockGstFields}
            identity={identity}
          />
          <DematDetails {...props} disabled={!contactReady} demat={demat} />
        </div>
      )
    }
    if (step === 2) return <AddressDetails {...props} />
    if (step === 3) {
      return (
        <div className="space-y-3">
          <BankDetails {...props} />
          <SupportingDocuments
            documents={documents}
            onPick={pickDocuments}
            onRemovePicked={removePicked}
            onRetry={retryUpload}
            uploadState={uploadState}
            uploading={uploading}
            existing={existingDocuments}
            onDeleteExisting={async (type, file) => {
              const mine = ++listSeq.current
              const left = await deleteMyDocument(type, file.blob_name)
              if (mine >= appliedSeq.current) { appliedSeq.current = mine; setExistingDocuments(left) }
            }}
            onPreview={setPreviewId}
            flags={documentFlags}
            onConfirm={confirmDocument}
            onUnconfirm={unconfirmDocument}
          />
        </div>
      )
    }
    return (
      <ReviewRequest
        values={values}
        documents={documents}
        existingDocuments={existingDocuments}
        onPreview={setPreviewId}
        register={register}
        setValue={setValue}
        errors={errors}
        onEdit={(target) => setStep(target)}
        onBack={previousStep}
        submitting={submitting || uploading}
        declarationsComplete={declarationsComplete}
        isResubmission={returned}
        unresolvedCount={unresolvedCount}
      />
    )
  }

  const heading = returned ? 'Update your application' : 'Request customer account'

  return (
    <FlagsContext.Provider value={flagsContext}>
      <AppShell backTo="/" onBack={() => setExitOpen(true)}>
        <PageContainer wide className="vendor-workspace h-full">
          <section className="vendor-workspace__card grid h-full min-h-0 overflow-hidden rounded-xl border border-[#b3c3e4]/80 bg-white shadow-[0_12px_36px_rgba(40,83,130,0.08)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-[#dce6ff] bg-[#eef2fb] p-5 lg:flex xl:p-6">
              <div>
                <p className="eyebrow">Customer onboarding</p>
                <h1 className="mt-3 text-2xl font-extrabold leading-[1.12] tracking-[-0.035em] text-navy-950">
                  {returned ? 'Fix and resubmit your application' : 'Request your customer account'}
                </h1>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {returned
                    ? 'Our team flagged a few details. Update them, or confirm they are correct, then send the application back for review.'
                    : 'Complete your company, tax, address, and bank details to start managing invoices and payments.'}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {trustPoints.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex min-h-10 items-center gap-2.5 rounded-lg border border-[#b3c3e4]/80 bg-white/75 px-3 text-[11px] font-bold text-navy-900">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                      <Icon size={16} />
                    </span>
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Application progress</p>
                <div className="mt-3 space-y-2">
                  {FORM_STEPS.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${item.id < step ? 'bg-emerald-100 text-emerald-700' : item.id === step ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>
                        {item.id < step ? <BadgeCheck size={14} /> : item.id}
                      </span>
                      <span className={`text-xs font-semibold ${item.id === step ? 'text-navy-900' : 'text-slate-500'}`}>{item.longTitle}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-col px-4 py-3 sm:px-6 xl:px-7">
              <header className="mb-2 flex flex-col gap-1 border-b border-slate-100 pb-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-navy-950 sm:text-2xl">{heading}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{FORM_STEPS[step - 1].longTitle} · Fields marked with an asterisk are required.</p>
                </div>
                {autosave.status === 'error' ? (
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700" role="status">
                    Couldn&apos;t save your progress yet, trying again…
                  </p>
                ) : savedAt && (
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700" role="status">
                    <Check size={13} /> Progress saved at {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </header>

              <FormProgress currentStep={step} />
              <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitRequest} noValidate>
                <div className="relative min-h-0 flex-1">
                <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden pb-3 pr-1">
                  {rejection && hasFlags && <ReturnedBanner rejection={rejection} items={flaggedItems} onGo={goToItem} />}
                  {rejection && !hasFlags && rejection.overall_remark && (
                    <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><strong>Note from our team:</strong> {rejection.overall_remark}</p>
                  )}
                  {attempted && <FormError count={errorCount} />}
                  {submitError && (
                    <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      <span className="font-semibold">Something went wrong.</span> {submitError}
                    </div>
                  )}

                  {renderStep()}
                </div>
                {step !== 4 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white to-transparent" />}
                </div>

                {step !== 4 && (
                  <div className="z-20 mt-3 shrink-0 rounded-lg border border-slate-300 bg-slate-50 p-2">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button type="button" variant="secondary" className="px-6" onClick={saveDraft} disabled={saving || uploading}>
                        {saving ? <Loader /> : <Save size={17} />} Save draft
                      </Button>
                      <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        {step > 1 && <Button type="button" variant="secondary" onClick={previousStep}><ArrowLeft size={17} /> Back</Button>}
                        <Button
                          type="button"
                          onClick={nextStep}
                          disabled={saving || uploading || checkingDuplicates || checkingPan || panTaken || (step === 1 && (identity.blocked || demat.loading))}
                        >
                          {saving || checkingDuplicates || checkingPan ? <><Loader /> {saving ? 'Saving...' : 'Checking...'}</> : <>{step === 3 ? 'Review request' : 'Continue'} <ArrowRight size={17} /></>}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </section>
        </PageContainer>
        <Modal
          open={exitOpen}
          onClose={() => setExitOpen(false)}
          onConfirm={saveAndExit}
          busy={saving}
          busyLabel="Saving…"
          title="Save and log out?"
          description="Your progress is saved to your account. Log in again any time to pick up where you left off."
          cancelLabel="Keep editing"
          confirmLabel="Save and log out"
          confirmVariant="primary"
        />
        <DocumentPreview items={previewItems} activeId={previewId} onChange={setPreviewId} onClose={() => setPreviewId(null)} />
      </AppShell>
    </FlagsContext.Provider>
  )
}
