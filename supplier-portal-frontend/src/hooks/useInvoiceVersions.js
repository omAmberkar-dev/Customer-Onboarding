import { useCallback, useEffect, useRef, useState } from 'react'
import { getInvoiceVersion, getInvoiceVersionFile, getInvoiceVersions } from '../api/vendorApi'
import { loadInvoicePdfUrl } from '../components/invoices/InvoiceCompare'
import { normalizeInvoice } from './useInvoiceUploads'

// The earlier versions of a replaced invoice, for the invoice detail popup. Nothing is fetched until the popup opens on an invoice that
// has been replaced (`submission_round` above 0). `select(n)` loads version n read-only (its details and its original file);
// `select(null)` goes back to the current invoice.
export default function useInvoiceVersions(invoice) {
  const invoiceId = invoice?.id
  const round = Number(invoice?.submission_round) || 0
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState('')
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState({ invoice: null, loading: false, url: '', error: '' })
  const blobUrl = useRef('')
  const token = useRef(0)

  const dropUrl = () => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
    blobUrl.current = ''
  }

  useEffect(() => {
    token.current += 1
    dropUrl()
    setSelected(null)
    setView({ invoice: null, loading: false, url: '', error: '' })
    setInfo(null)
    setInfoError('')
    if (!invoiceId || round < 1 || typeof invoiceId !== 'number') return undefined
    let ignore = false
    getInvoiceVersions(invoiceId)
      .then((data) => { if (!ignore) setInfo(data) })
      .catch((err) => { if (!ignore) setInfoError(err.message || 'Unable to load the earlier versions.') })
    return () => { ignore = true; dropUrl() }
  }, [invoiceId, round])

  const select = useCallback(async (versionNo) => {
    const mine = ++token.current
    dropUrl()
    if (versionNo == null) {
      setSelected(null)
      setView({ invoice: null, loading: false, url: '', error: '' })
      return
    }
    setSelected(versionNo)
    setView({ invoice: null, loading: true, url: '', error: '' })
    try {
      const [detail, file] = await Promise.all([getInvoiceVersion(invoiceId, versionNo), getInvoiceVersionFile(invoiceId, versionNo).catch(() => null)])
      if (mine !== token.current) return
      const version = normalizeInvoice(detail, 0)
      setView({ invoice: version, loading: false, url: '', error: '' })
      if (!file) {
        setView({ invoice: version, loading: false, url: '', error: 'The original file of this version is not available.' })
        return
      }
      try {
        const url = await loadInvoicePdfUrl({ blobUrl: file.blob_url, blob_url: file.blob_url })
        if (mine !== token.current) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return }
        if (url.startsWith('blob:')) blobUrl.current = url
        setView({ invoice: version, loading: false, url, error: '' })
      } catch (err) {
        if (mine === token.current) setView({ invoice: version, loading: false, url: '', error: err.message || 'Unable to open this file.' })
      }
    } catch (err) {
      if (mine === token.current) setView({ invoice: null, loading: false, url: '', error: err.message || 'Unable to open this version.' })
    }
  }, [invoiceId])

  return { info, infoError, selected, select, view }
}
