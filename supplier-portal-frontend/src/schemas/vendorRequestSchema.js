import { z } from 'zod'
import { phoneRuleFor } from '../data/countryCodes'
import { DEMAT_ID_FIELDS, DEMAT_RULES, dematText } from '../utils/demat'
import { CIN_PATTERN, cinApplies } from '../data/vendorTypes'

const required = (label) => z.string().trim().min(1, `${label} is required`)
export const vendorRequestSchema = z.object({
  vendorLegalName: required('Customer legal name'), vendorPhoneCode: required('Country code'), vendorPhone: required('Phone number'),vendorEmail: required('Email address').email('Enter a valid email address'), vendorType: required('Customer type'), yearEstablished: z.string().optional().refine((v) => !v || (/^\d{4}$/.test(v) && +v <= new Date().getFullYear()), 'Enter a valid year'), currency: required('Currency'), registrationNumber: required('Registration number'), msmeStatus: required('MSME status'), assignedRm: z.string().optional(), udyamNumber: z.string().optional(),
  registeredAddress1: required('Address'), registeredDistrict: required('District'), registeredCity: required('City'), registeredState: required('State'), registeredPostalCode: required('Postal code'),
  pan: required('PAN'), gstin: z.string().optional(), aadhaar: z.string().optional(), cin: z.string().optional(),
  dematId: z.string().optional(), dpId: z.string().optional(), boId: z.string().optional(), depository: z.string().optional(),
  accountHolderName: required('Account holder name'), bankName: required('Bank name'), branchName: required('Branch name'), accountNumber: required('Account number').regex(/^\d{9,18}$/, 'Enter a valid 9–18 digit account number (digits only)'), confirmAccountNumber: required('Confirm account number'), ifsc: required('IFSC code'),
  accurateDeclaration: z.boolean(), termsDeclaration: z.boolean(),
}).superRefine((data, ctx) => {
  const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (data.msmeStatus === 'Registered' && !data.udyamNumber?.trim()) add('udyamNumber', 'Udyam registration number is required')
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan)) add('pan', 'Enter a valid PAN, e.g. ABCDE1234F')
  if (!/^\d{6}$/.test(data.registeredPostalCode)) add('registeredPostalCode', 'Enter a valid 6-digit PIN code')
  if (data.gstin?.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin)) add('gstin', 'Enter a valid 15-character GSTIN')
  if (cinApplies(data.msmeStatus) && !data.cin?.trim()) add('cin', 'CIN is required')
  else if (data.cin?.trim() && !CIN_PATTERN.test(data.cin.trim())) add('cin', 'Enter a valid 21-character CIN')
  if (data.aadhaar?.trim() && !/^[2-9]\d{11}$/.test(data.aadhaar.replace(/\s/g, ''))) add('aadhaar', 'Enter a valid 12-digit Aadhaar number')
  const phoneRule = phoneRuleFor(data.vendorPhoneCode)
  if (data.vendorPhone?.trim() && !phoneRule.pattern.test(data.vendorPhone.replace(/\s/g, ''))) add('vendorPhone', phoneRule.message)
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc || '')) add('ifsc', 'Enter a valid IFSC, e.g. HDFC0001234')
  if (data.confirmAccountNumber?.trim() && data.confirmAccountNumber.trim() !== data.accountNumber?.trim()) add('confirmAccountNumber', 'The account numbers do not match')
  Object.entries(DEMAT_RULES).forEach(([name, [pattern, message]]) => { if (dematText(data[name]) && !pattern.test(dematText(data[name]))) add(name, message) })
  if (!data.depository && DEMAT_ID_FIELDS.some((name) => dematText(data[name]))) add('depository', 'Select the depository (CDSL or NSDL)')
})
