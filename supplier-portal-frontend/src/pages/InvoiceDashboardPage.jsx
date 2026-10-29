import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePenLine } from 'lucide-react'
import { getMyAgreements } from '../api/vendorApi'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import InvoiceUploader from '../components/invoices/InvoiceUploader'
import InvoiceKpis from '../components/invoices/InvoiceKpis'
import InvoiceList from '../components/invoices/InvoiceList'
import ReadFailureModal from '../components/invoices/ReadFailureModal'
import useInvoiceUploads from '../hooks/useInvoiceUploads'
import useAuth from '../hooks/useAuth'
import useAgreementHold, { HOLD_TOOLTIP } from '../hooks/useAgreementHold'

export default function InvoiceDashboardPage() {
  const { user } = useAuth()
  const { onHold } = useAgreementHold()
  const [renewalReady, setRenewalReady] = useState(false)
  const [uploadSignal, setUploadSignal] = useState(0)
  const { invoices, addFiles, removeInvoice, extractInvoice, error, clearError, loadError, isLoading, reload, readFailures, dismissReadFailures } = useInvoiceUploads(user?.vendor_id)

  // A renewed agreement waiting for the vendor's signature gets a thin banner; failing to check just hides it.
  useEffect(() => {
    let ignore = false
    getMyAgreements().then((list) => { if (!ignore) setRenewalReady(list.some((item) => item.can_sign && item.status === 'sent')) }).catch(() => {})
    return () => { ignore = true }
  }, [])

  return (
    <AppShell breadcrumb="Invoices">
      <PageContainer wide className="vendor-workspace h-full">
        <div className="mx-auto flex h-full max-w-[1820px] min-h-0 flex-col gap-3 overflow-y-auto px-1 pb-3 sm:px-2">
          {renewalReady && (
            <Link to="/agreements" className="flex shrink-0 items-center gap-2 rounded-lg border border-[#b3c3e4] bg-[#eef2fb] px-3 py-2 text-xs font-semibold text-[#052e86] transition hover:bg-[#dce6ff]/60">
              <FilePenLine size={15} className="shrink-0" />
              <span>A renewed agreement is waiting for your signature. <span className="font-bold underline">Review and sign</span></span>
            </Link>
          )}
          <div className="shrink-0 px-1">
            <h1 className="text-base font-extrabold text-[#000000]">Invoices</h1>
            <p className="text-xs text-[#5f5f5f]">Upload your invoices and track their extraction status, amounts and dates. Invoices uploaded on your behalf by your Relationship Manager also appear here.</p>
            {!isLoading && !loadError && invoices.length > 0 && <div className="mt-2"><InvoiceKpis invoices={invoices} /></div>}
          </div>
          {/* While on hold (no agreement in force) uploads and replacements are refused by the server; the controls are frozen here. */}
          <div className="relative shrink-0" title={onHold ? HOLD_TOOLTIP : undefined}>
            <InvoiceUploader onFiles={(files) => { if (addFiles(files)) setUploadSignal((count) => count + 1) }} error={error} onDismissError={clearError} />
            {onHold && <div className="absolute inset-0 z-10 cursor-not-allowed rounded-xl bg-white/60" aria-label={HOLD_TOOLTIP} />}
          </div>
          <div
            data-agreement-hold={onHold ? 'true' : undefined}
            className="contents"
            onClickCapture={(event) => { if (onHold && event.target.closest?.('button[title*="eplace invoice"]')) { event.preventDefault(); event.stopPropagation() } }}
          >
          <InvoiceList
            invoices={invoices}
            onRemove={removeInvoice}
            onExtract={extractInvoice}
            isLoading={isLoading}
            error={loadError}
            uploadedBy={user?.email}
            uploadSignal={uploadSignal}
            onReplaced={reload}
          />
          </div>
        </div>
        <ReadFailureModal failures={readFailures} onClose={dismissReadFailures} onRetry={(files) => { dismissReadFailures(); if (addFiles(files)) setUploadSignal((count) => count + 1) }} />
      </PageContainer>
    </AppShell>
  )
}
