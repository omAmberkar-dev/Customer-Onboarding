import { createContext } from 'react'

// How an invoice is read for display (the field getters and formatters), shared by the invoice details popup and the compare screen.

export const rawItems = (invoice) => {
  const value = invoice.mainLineItemData ?? invoice.main_line_item_data ?? invoice.line_items ?? invoice.line_item_data
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export const firstData = (invoice) => rawItems(invoice)[0] || {}
export const pick = (invoice, keys, fallback = '') => {
  const detail = firstData(invoice)
  for (const key of keys) {
    const value = invoice?.[key] ?? detail?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

export const display = (value) => (value === undefined || value === null || value === '' ? '' : String(value))
export const numberValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
export const amount = (value, currency = 'INR') => {
  const parsed = numberValue(value)
  if (parsed === null) return ''
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed)
}
export const dateValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const invoiceNumber = (invoice) => pick(invoice, ['invoice_number', 'invoice_no', 'invoice_id'])
export const vendorName = (invoice) => pick(invoice, ['vendor_name', 'extracted_vendor_name', 'supplier_name'], 'Customer invoice')
export const cleanGstin = (value) => (value ? String(value).replace(/^[\s:;.-]+/, '').trim() : value)
export const vendorGstin = (invoice) => cleanGstin(pick(invoice, ['vendor_tax_id', 'vendor_gstin', 'supplier_gstin', 'gstin']))
export const vendorGstinVerified = (invoice) => Boolean(pick(invoice, ['vendor_gstin_verified']))
export const customerGstin = (invoice) => cleanGstin(pick(invoice, ['customer_tax_id', 'customer_gstin', 'billing_gstin', 'buyer_gstin']))
export const totalValue = (invoice) => {
  const direct = pick(invoice, ['total_amount', 'invoice_total', 'amount'], null)
  if (direct !== null) return direct
  const values = rawItems(invoice).map((item) => numberValue(item?.total_amount ?? item?.taxable_amount ?? item?.amount) || 0)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}


export const FlaggedContext = createContext(new Set())
export const OVERVIEW_FIELDS = new Set(['vendor_name', 'vendor_tax_id', 'vendor_address', 'customer_name', 'customer_tax_id', 'billing_address', 'invoice_number', 'invoice_date', 'due_date', 'payment_term', 'currency'])
export const AMOUNT_FIELDS = new Set(['subtotal', 'total_tax', 'total_amount', 'line_items'])
export const tabOfField = (fieldKey) => (OVERVIEW_FIELDS.has(fieldKey) ? 'overview' : AMOUNT_FIELDS.has(fieldKey) ? 'amounts' : null)

// The red frame sits outside the field (padding and an equal negative margin keep the field where it was).
export const taxRate = (tax) => {
  const value = tax.rate ?? tax.tax_rate
  if (value === undefined || value === null || value === '') return ''
  return String(value).trim().endsWith('%') ? value : `${value}%`
}

export const CELL_ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' }

// Headers are always centered; body cells follow `aligns` (only amount columns are right-aligned).

