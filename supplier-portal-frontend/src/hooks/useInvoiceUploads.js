import { useCallback, useEffect, useState } from 'react'
import { extractInvoice as extractInvoiceApi, getVendorInvoices } from '../api/vendorApi'

const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']
const MAX_SIZE = 10 * 1024 * 1024
const POLL_INTERVAL_MS = 5000

const isAcceptedFile = (file) => ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))

function toValidDate(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function resolveBlobUrl(invoice) {
  return invoice.blob_url
    ?? invoice.blobUrl
    ?? invoice.document?.blob_url
    ?? invoice.file?.blob_url
    ?? invoice.storage?.blob_url
    ?? invoice.metadata?.blob_url
    ?? invoice.invoice?.blob_url
    ?? invoice.invoice_file?.blob_url
    ?? ''
}

// The latest thing that happened to an invoice: its upload, or any later action (a return, a replacement, a status change). The list shows
// the most recently touched invoices first.
function latestActivity(invoice, fallback) {
  const times = [invoice.created_at, invoice.uploaded_at, invoice.updated_at, invoice.replaced_at, invoice.returned_at]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((time) => !Number.isNaN(time))
  return times.length ? new Date(Math.max(...times)) : fallback
}

export function normalizeInvoice(invoice, index) {
  const id = invoice.invoice_id ?? invoice.id ?? `invoice-${index}`
  const uploadedAt = toValidDate(invoice.uploaded_at ?? invoice.created_at ?? invoice.invoice_date)
  return {
    ...invoice,
    id,
    activityAt: latestActivity(invoice, uploadedAt),
    name: invoice.original_file_name ?? invoice.file_name ?? invoice.filename ?? invoice.invoice_number ?? invoice.name ?? `Invoice ${id}`,
    size: Number(invoice.file_size_bytes ?? invoice.file_size ?? invoice.size) || 0,
    type: invoice.mime_type ?? invoice.content_type ?? invoice.type ?? '',
    uploadedAt,
    url: invoice.file_url ?? invoice.document_url ?? invoice.url ?? '',
    blobUrl: resolveBlobUrl(invoice),
    mainLineItemData: invoice.main_line_item_data ?? invoice.mainLineItemData ?? invoice.line_item_data ?? invoice.line_items ?? null,
    extractionStatus: invoice.status ?? 'completed',
    source: 'api',
  }
}

export default function useInvoiceUploads(vendorId) {
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(Boolean(vendorId))

  useEffect(() => {
    let ignore = false

    if (!vendorId) {
      setInvoices([])
      setLoadError('Customer ID is missing. Please log in again.')
      setIsLoading(false)
      return () => { ignore = true }
    }

    setIsLoading(true)
    setLoadError('')

    getVendorInvoices(vendorId)
      .then((records) => {
        if (ignore) return
        const remoteInvoices = records.map(normalizeInvoice)
        setInvoices((current) => [...current.filter((invoice) => invoice.source !== 'api'), ...remoteInvoices])
      })
      .catch((requestError) => {
        if (!ignore) setLoadError(requestError?.message || 'Unable to load uploaded invoices.')
      })
      .finally(() => {
        if (!ignore) setIsLoading(false)
      })

    return () => { ignore = true }
  }, [vendorId])

  // Keeps the list live: a reviewer returning or approving an invoice shows up without a page refresh. Polls quietly while the tab is
  // visible and again as soon as it regains focus; a failed poll is ignored, and the list only re-renders when something changed.
  useEffect(() => {
    if (!vendorId) return undefined
    let ignore = false
    let lastSnapshot = null

    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      getVendorInvoices(vendorId)
        .then((records) => {
          if (ignore) return
          const snapshot = JSON.stringify(records)
          if (snapshot === lastSnapshot) return
          lastSnapshot = snapshot
          const remoteInvoices = records.map(normalizeInvoice)
          setInvoices((current) => [...current.filter((invoice) => invoice.source !== 'api'), ...remoteInvoices])
        })
        .catch(() => {})
    }

    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      ignore = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [vendorId])

  // Fetches the vendor's invoices again (after one was replaced) and resolves with them, so a caller can wait for the new data.
  const reload = useCallback(async () => {
    const remoteInvoices = (await getVendorInvoices(vendorId)).map(normalizeInvoice)
    setInvoices((current) => [...current.filter((invoice) => invoice.source !== 'api'), ...remoteInvoices])
    return remoteInvoices
  }, [vendorId])

  // Files that could not be read: they are taken off the list (they belong in no tab) and reported in a dialog instead.
  const [readFailures, setReadFailures] = useState([])
  const failRead = useCallback((item, message) => {
    URL.revokeObjectURL(item.url)
    setInvoices((current) => current.filter((invoice) => invoice.id !== item.id))
    setReadFailures((current) => [...current, { id: item.id, name: item.name, file: item.file, message }])
  }, [])
  const dismissReadFailures = useCallback(() => setReadFailures([]), [])

  const patchInvoice = useCallback((id, changes) => {
    setInvoices((current) => current.map((invoice) => (invoice.id === id ? { ...invoice, ...changes } : invoice)))
  }, [])

  const extractItem = useCallback(async (item) => {
    if (!vendorId) {
      failRead(item, 'Your session has expired. Please sign in again.')
      return
    }

    patchInvoice(item.id, { extractionStatus: 'extracting', extractionError: '', extractionProgress: 0 })

    const progressTimer = setInterval(() => {
      setInvoices((current) => current.map((invoice) => (
        invoice.id === item.id && invoice.extractionStatus === 'extracting'
          ? { ...invoice, extractionProgress: Math.min(95, (invoice.extractionProgress ?? 0) + Math.max(1, (95 - (invoice.extractionProgress ?? 0)) * 0.12)) }
          : invoice
      )))
    }, 400)

    try {
      await extractInvoiceApi(vendorId, item.file)
      const records = await getVendorInvoices(vendorId)
      const remoteInvoices = records.map(normalizeInvoice)
      URL.revokeObjectURL(item.url)
      setInvoices((current) => [
        ...current.filter((invoice) => invoice.source === 'local' && invoice.id !== item.id),
        ...remoteInvoices,
      ])
      setLoadError('')
    } catch (requestError) {
      failRead(item, requestError?.message || '')
    } finally {
      clearInterval(progressTimer)
    }
  }, [failRead, patchInvoice, vendorId])

  // Uploaded files are extracted straight away, one after another; there is no manual extract step.
  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return false

    const accepted = []
    const rejected = []
    files.forEach((file) => {
      if (!isAcceptedFile(file)) { rejected.push(`${file.name} (unsupported file type)`); return }
      if (file.size > MAX_SIZE) { rejected.push(`${file.name} (larger than 10 MB)`); return }
      accepted.push(file)
    })

    const items = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date(),
      url: URL.createObjectURL(file),
      file,
      extractionStatus: 'queued',
      extractionError: '',
      source: 'local',
    }))

    if (items.length) {
      setInvoices((current) => [...items, ...current])
      ;(async () => { for (const item of items) await extractItem(item) })()
    }
    setError(rejected.length ? `Couldn't upload ${rejected.join(', ')}` : '')
    return items.length > 0
  }, [extractItem])

  const removeInvoice = useCallback((id) => {
    setInvoices((current) => {
      const target = current.find((invoice) => invoice.id === id)
      if (target?.source === 'local') URL.revokeObjectURL(target.url)
      return current.filter((invoice) => invoice.id !== id)
    })
  }, [])

  const clearError = useCallback(() => setError(''), [])

  // Retry for an upload whose extraction failed.
  const extractInvoice = useCallback((id) => {
    const target = invoices.find((invoice) => invoice.id === id)
    if (target?.file && target.source === 'local') extractItem(target)
  }, [extractItem, invoices])

  return { invoices, addFiles, removeInvoice, extractInvoice, error, clearError, loadError, isLoading, reload, readFailures, dismissReadFailures }
}
