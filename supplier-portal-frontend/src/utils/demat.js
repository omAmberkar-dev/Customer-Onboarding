// Demat account details: all optional, but any of the three IDs needs its depository. The IDs are alphanumeric, kept without
// spaces and in capitals, at the lengths SAP keeps (the backend's demat.py applies the same rules on submit).
export const DEPOSITORIES = ['CDSL', 'NSDL']
export const DEMAT_ID_FIELDS = ['dematId', 'dpId', 'boId']

export const dematText = (value) => String(value ?? '').replace(/\s/g, '').toUpperCase()

export const DEMAT_RULES = {
  dematId: [/^[A-Z0-9]{8,16}$/, 'Enter a valid Demat ID: 8–16 letters or digits'],
  dpId: [/^[A-Z0-9]{8}$/, 'Enter a valid DP ID: 8 letters or digits, e.g. IN300214 or 12081600'],
  boId: [/^[A-Z0-9]{16}$/, 'Enter a valid BO ID: 16 letters or digits'],
}

