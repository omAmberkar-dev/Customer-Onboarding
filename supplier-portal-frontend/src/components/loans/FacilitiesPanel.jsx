import { Link } from 'react-router-dom'
import { Panel, StatusPill, DataTable, Unavailable } from '../finance/FinanceUi'
import { formatDate, formatMoney, useFinance } from '../../utils/finance'

// LAS sends null when it cannot work the outstanding out (dues not readable, or a disbursed drawdown not yet scheduled).
const CANT_SHOW = 'Can’t be shown'

// The customer's approved sanctions with LAS's own utilised, available and outstanding figures (LAS customer-finance.mjs),
// and the drawdowns under each. Only approved sanctions are facilities; applications under review stay in the tracker and
// the Sanctions list below. SAP keeps no facility number or sanction-level rate, so neither is shown: each drawdown
// carries its own rate.
export default function FacilitiesPanel() {
  const { data, error, loading } = useFinance()
  if (loading && !data) return null
  if (error) return <Unavailable what="Your facility figures" />
  if (!data?.onboarded) return null
  const drawdownsOf = (f) => (data.drawdowns || []).filter((d) => d.sanctionNo && d.sanctionNo === f.sanctionNo)
  const columns = [
    { key: 'sanctionNo', label: 'Sanction No.', render: (f) => <b className="text-navy-900">{f.sanctionNo}</b> },
    { key: 'sanctionedAmount', label: 'Sanctioned', align: 'right', render: (f) => formatMoney(f.sanctionedAmount, f.currency) },
    { key: 'utilised', label: 'Utilised', align: 'right', render: (f) => formatMoney(f.utilised, f.currency) },
    { key: 'outstandingPrincipal', label: 'Outstanding', align: 'right', render: (f) => (f.outstandingPrincipal === null ? <span className="text-xs font-semibold text-slate-500">{CANT_SHOW}</span> : formatMoney(f.outstandingPrincipal, f.currency)), sort: (f) => f.outstandingPrincipal ?? -1 },
    { key: 'available', label: 'Available', align: 'right', render: (f) => formatMoney(f.available, f.currency) },
    { key: 'drawdowns', label: 'Drawdowns', nowrap: false, render: (f) => {
      const nos = drawdownsOf(f).map((d) => d.disbursementNo || `Request ${d.applicationNo}`)
      return nos.length ? <Link to="/drawdowns" className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>{nos.join(', ')}</Link> : '—'
    }, sort: (f) => f.drawdowns },
    { key: 'sanctionDate', label: 'Sanctioned on', render: (f) => formatDate(f.sanctionDate) },
    { key: 'validUntil', label: 'Valid until', render: (f) => formatDate(f.validUntil) },
    { key: 'status', label: 'Status', render: (f) => <StatusPill status={f.status} /> },
  ]
  return (
    <Panel title="Your sanctions" subtitle={`Customer No. ${data.customerNo} · approved sanctions only. Utilised is the drawn total; outstanding is the principal still to repay on its drawdowns.`}>
      <DataTable columns={columns} rows={data.facilities} rowKey={(f) => f.id} minWidth={980} caption="Your sanctions" initialSort={{ key: 'sanctionDate', dir: 'desc' }}
        empty="No approved sanction yet. Once your sanction is approved it appears here with its limit and utilisation." />
    </Panel>
  )
}
