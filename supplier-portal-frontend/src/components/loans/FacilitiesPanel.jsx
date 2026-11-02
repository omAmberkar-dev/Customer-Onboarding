import { Panel, StatusPill, DataTable, Unavailable } from '../finance/FinanceUi'
import { formatDate, formatMoney, useFinance } from '../../utils/finance'

// The customer's approved facilities with LAS's own utilised, available and outstanding figures (LAS customer-finance.mjs).
// Only approved sanctions are facilities; applications under review stay in the tracker and the Sanctions list below.
// SAP keeps no facility number or sanction-level rate, so neither is shown: each drawdown carries its own rate.
export default function FacilitiesPanel() {
  const { data, error, loading } = useFinance()
  if (loading && !data) return null
  if (error) return <Unavailable what="Your facility figures" />
  if (!data?.onboarded) return null
  const columns = [
    { key: 'sanctionNo', label: 'Sanction No.', render: (f) => <b className="text-navy-900">{f.sanctionNo}</b> },
    { key: 'sanctionedAmount', label: 'Sanctioned', align: 'right', render: (f) => formatMoney(f.sanctionedAmount, f.currency) },
    { key: 'sanctionDate', label: 'Sanction date', render: (f) => formatDate(f.sanctionDate) },
    { key: 'validFrom', label: 'Valid from', render: (f) => formatDate(f.validFrom) },
    { key: 'validUntil', label: 'Valid until / maturity', render: (f) => formatDate(f.validUntil) },
    { key: 'utilised', label: 'Utilised', align: 'right', render: (f) => formatMoney(f.utilised, f.currency) },
    { key: 'available', label: 'Available', align: 'right', render: (f) => formatMoney(f.available, f.currency) },
    { key: 'outstandingPrincipal', label: 'Outstanding principal', align: 'right', render: (f) => (f.outstandingPrincipal === null ? '—' : formatMoney(f.outstandingPrincipal, f.currency)), sort: (f) => f.outstandingPrincipal ?? -1 },
    { key: 'drawdowns', label: 'Drawdowns', align: 'right' },
    { key: 'status', label: 'Status', render: (f) => <StatusPill status={f.status} /> },
  ]
  return (
    <Panel title="Your facilities" subtitle={`Customer No. ${data.customerNo} · approved sanctions only. Utilised is the drawn total; outstanding principal is what remains to repay.`}>
      <DataTable columns={columns} rows={data.facilities} rowKey={(f) => f.id} minWidth={1040} caption="Your facilities" initialSort={{ key: 'sanctionDate', dir: 'desc' }}
        empty="No approved facility yet. Once your sanction is approved it appears here with its limit and utilisation." />
    </Panel>
  )
}
