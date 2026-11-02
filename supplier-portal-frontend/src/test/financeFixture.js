// Isolated test data in the shape of LAS's customer finance answer (customer-finance.mjs), for the page tests only.
// Never imported by the app.
export const FINANCE = {
  onboarded: true,
  customerNo: '100440',
  customerName: 'Osprey Security Solutions',
  facilities: [
    { id: '1000-11', sanctionNo: '100411', applicationNo: '11', product: 'LAS', currency: 'INR', sanctionedAmount: 5000000, sanctionDate: '2026-08-28', validFrom: '2026-09-01', validUntil: '2099-08-31', utilised: 1000000, available: 1000000, outstandingPrincipal: 1000000, status: 'active', drawdowns: 3 },
  ],
  drawdowns: [
    { id: '1000-501', applicationNo: '501', disbursementNo: '23000068', sanctionNo: '100411', currency: 'INR', requestedAmount: 1000000, approvedAmount: 1000000, disbursedAmount: 1000000, appliedOn: '2026-09-01', approvedOn: '2026-09-02', disbursedOn: '2026-09-01', rate: 9.25, maturityDate: '2099-02-28', status: 'disbursed' },
    { id: '1000-502', applicationNo: '502', disbursementNo: '', sanctionNo: '100411', currency: 'INR', requestedAmount: 250000, approvedAmount: null, disbursedAmount: null, appliedOn: '2026-10-01', approvedOn: '', disbursedOn: '', rate: 9.25, maturityDate: '2099-02-28', status: 'pending_approval' },
    { id: '1000-503', applicationNo: '503', disbursementNo: '', sanctionNo: '100411', currency: 'INR', requestedAmount: 300000, approvedAmount: null, disbursedAmount: null, appliedOn: '2026-09-20', approvedOn: '', disbursedOn: '', rate: 9.25, maturityDate: '2099-02-28', status: 'rejected' },
  ],
  schedule: [
    { id: 'a', disbursementNo: '23000068', sanctionNo: '100411', instalment: 1, dueDate: '2026-09-30', kind: 'interest', description: 'Interest', amount: 7602.74, paid: 7602.74, outstanding: 0, currency: 'INR', status: 'paid' },
    { id: 'b', disbursementNo: '23000068', sanctionNo: '100411', instalment: 2, dueDate: '2026-10-31', kind: 'interest', description: 'Interest', amount: 7857.53, paid: 3000, outstanding: 4857.53, currency: 'INR', status: 'overdue' },
    { id: 'c', disbursementNo: '23000068', sanctionNo: '100411', instalment: 3, dueDate: '2099-01-31', kind: 'interest', description: 'Interest', amount: 7800, paid: 0, outstanding: 7800, currency: 'INR', status: 'upcoming' },
    { id: 'd', disbursementNo: '23000068', sanctionNo: '100411', instalment: 3, dueDate: '2099-01-31', kind: 'fee', description: 'Processing fee', amount: 500, paid: 0, outstanding: 500, currency: 'INR', status: 'upcoming' },
    { id: 'e', disbursementNo: '23000068', sanctionNo: '100411', instalment: 4, dueDate: '2099-02-28', kind: 'principal', description: 'Final repayment', amount: 1000000, paid: 0, outstanding: 1000000, currency: 'INR', status: 'upcoming' },
  ],
  payments: [
    { id: '1000-7001', receiptNo: '7001', paymentDate: '2026-10-05', reference: 'UTR7001', referenceType: 'NEFT', disbursementNo: '', sanctionNo: '', amount: 12000, currency: 'INR', status: 'confirmed', applied: 10602.74, unapplied: 1397.26,
      allocations: [{ disbursementNo: '23000068', dueDate: '2026-09-30', kind: 'interest', description: 'Interest', amount: 7602.74, appliedOn: '2026-10-06' }, { disbursementNo: '23000068', dueDate: '2026-10-31', kind: 'interest', description: 'Interest', amount: 3000, appliedOn: '2026-10-06' }] },
    { id: '1000-7002', receiptNo: '7002', paymentDate: '2026-10-28', reference: 'UTR7002', referenceType: 'NEFT', disbursementNo: '', sanctionNo: '', amount: 5000, currency: 'INR', status: 'pending', applied: 0, unapplied: 0, allocations: [] },
  ],
  transactions: [
    { id: 'disb-23000068', date: '2026-09-01', reference: '23000068', disbursementNo: '23000068', sanctionNo: '100411', type: 'disbursement', description: 'Loan amount paid out to you', inflow: 1000000, outflow: 0, currency: 'INR', status: 'posted', paymentReference: '' },
    { id: 'pay-1000-7001-0', date: '2026-10-05', reference: '7001', disbursementNo: '23000068', sanctionNo: '', type: 'interest_payment', description: 'Interest for 2026-09-30', inflow: 0, outflow: 7602.74, currency: 'INR', status: 'posted', paymentReference: 'UTR7001' },
    { id: 'pay-1000-7001-1', date: '2026-10-05', reference: '7001', disbursementNo: '23000068', sanctionNo: '', type: 'interest_payment', description: 'Interest for 2026-10-31', inflow: 0, outflow: 3000, currency: 'INR', status: 'posted', paymentReference: 'UTR7001' },
    { id: 'pay-1000-7001-unapplied', date: '2026-10-05', reference: '7001', disbursementNo: '', sanctionNo: '', type: 'payment', description: 'Payment received, not yet applied to a due', inflow: 0, outflow: 1397.26, currency: 'INR', status: 'posted', paymentReference: 'UTR7001' },
    { id: 'pay-1000-7002', date: '2026-10-28', reference: '7002', disbursementNo: '', sanctionNo: '', type: 'payment', description: 'Payment being verified', inflow: 0, outflow: 5000, currency: 'INR', status: 'pending', paymentReference: 'UTR7002' },
  ],
  summary: {
    asOf: '2026-11-02', sanctioned: 5000000, utilised: 1000000, available: 1000000, disbursed: 1000000, inflows: 1000000, outflows: 12000, net: 988000,
    pendingPayments: 5000, principalRepaid: 0, interestPaid: 10602.74, feesPaid: 0, interestCharged: 15460.27, feesCharged: 5450,
    outstandingPrincipal: 1000000, outstanding: 1004857.53, overdue: 4857.53,
    nextDue: { date: '2099-01-31', principal: 0, interest: 7800, charges: 500, total: 8300 },
    monthly: [{ month: '2026-09', inflow: 1000000, outflow: 0, net: 1000000 }, { month: '2026-10', inflow: 0, outflow: 12000, net: -12000 }],
  },
  available: { flows: true, schedule: true, payments: true, allocations: true },
}

export const NOTIFICATIONS = {
  items: [
    { id: 'overdue-2026-10-31', kind: 'action', tone: 'overdue', title: '₹4,857.53 is overdue', detail: ['Oldest due date 2026-10-31'], on: '2026-10-31', to: '/repayments', read: false },
    { id: 'payment-7001', kind: 'update', tone: 'approved', title: 'Payment of ₹12,000.00 confirmed', detail: ['Ref. UTR7001'], on: '2026-10-05', to: '/payments', read: true },
  ],
  unread: 1, readState: true, unavailable: [],
}
