// Incorporated entities have a CIN; every other vendor type does not, so the field is only offered (and shown) for these.
export const COMPANY_VENDOR_TYPES = ['Private limited company', 'Public limited company']

export const isCompanyType = (vendorType) => COMPANY_VENDOR_TYPES.includes(vendorType)
