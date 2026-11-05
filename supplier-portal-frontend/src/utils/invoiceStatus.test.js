import { describe, expect, it } from 'vitest'
import { invoiceProgress, statusDetails } from './invoiceStatus'

// Each step as "label:state", for one invoice.
const steps = (invoice) => invoiceProgress(invoice).map((s) => `${s.label}:${s.state}`)

describe('invoiceProgress', () => {
  it('follows submission, verification, approval and the outcome as the review app records them', () => {
    expect(steps({ source: 'local', extractionStatus: 'extracting' })).toEqual(['Submitted:current', 'Verification:upcoming', 'Approval:upcoming', 'Processed:upcoming'])
    expect(steps({ source: 'api', status: 'Pending Approval' })).toEqual(['Submitted:done', 'Verification:current', 'Approval:upcoming', 'Processed:upcoming'])
    expect(steps({ source: 'api', status: 'Sent for Approval' })).toEqual(['Submitted:done', 'Verification:done', 'Approval:current', 'Processed:upcoming'])
    expect(steps({ source: 'api', status: 'Pending Authorization' })).toEqual(['Submitted:done', 'Verification:done', 'Approval:current', 'Processed:upcoming'])
    expect(steps({ source: 'api', status: 'Approved' })).toEqual(['Submitted:done', 'Verification:done', 'Approval:done', 'Approved:done'])
  })

  it('stops where the invoice stopped: unreadable, returned for correction, or rejected', () => {
    expect(steps({ source: 'local', extractionStatus: 'failed' })[0]).toBe('Could not be read:stopped')
    expect(steps({ source: 'api', status: 'Returned to Vendor' })).toEqual(['Submitted:done', 'Returned for correction:stopped', 'Approval:upcoming', 'Processed:upcoming'])
    expect(steps({ source: 'api', status: 'Rejected' })).toEqual(['Submitted:done', 'Verification:done', 'Approval:done', 'Rejected:stopped'])
  })

  it('agrees with the status pill: anything else is still under review', () => {
    for (const status of ['Pending', 'completed', 'Something new']) {
      expect(statusDetails({ source: 'api', status }).label).toBe('Under review')
      expect(steps({ source: 'api', status })[1]).toBe('Verification:current')
    }
  })
})
