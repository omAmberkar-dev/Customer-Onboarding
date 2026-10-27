// Dialling codes for the phone field. Each code appears once (shared codes are listed as one entry), so a code
// alone identifies the entry. India is the default and is pinned to the top; the rest follow alphabetically.
export const DEFAULT_COUNTRY_CODE = '+91'

const OTHER_COUNTRIES = [
  ['Afghanistan', '+93'], ['Albania', '+355'], ['Algeria', '+213'], ['Argentina', '+54'], ['Armenia', '+374'],
  ['Australia', '+61'], ['Austria', '+43'], ['Azerbaijan', '+994'], ['Bahrain', '+973'], ['Bangladesh', '+880'],
  ['Belarus', '+375'], ['Belgium', '+32'], ['Bhutan', '+975'], ['Bolivia', '+591'], ['Bosnia and Herzegovina', '+387'],
  ['Botswana', '+267'], ['Brazil', '+55'], ['Brunei', '+673'], ['Bulgaria', '+359'], ['Cambodia', '+855'],
  ['Cameroon', '+237'], ['Chile', '+56'], ['China', '+86'], ['Colombia', '+57'], ['Costa Rica', '+506'],
  ['Croatia', '+385'], ['Cyprus', '+357'], ['Czech Republic', '+420'], ['Denmark', '+45'], ['Ecuador', '+593'],
  ['Egypt', '+20'], ['Estonia', '+372'], ['Ethiopia', '+251'], ['Finland', '+358'], ['France', '+33'],
  ['Georgia', '+995'], ['Germany', '+49'], ['Ghana', '+233'], ['Greece', '+30'], ['Hong Kong', '+852'],
  ['Hungary', '+36'], ['Iceland', '+354'], ['Indonesia', '+62'], ['Iran', '+98'], ['Iraq', '+964'],
  ['Ireland', '+353'], ['Israel', '+972'], ['Italy', '+39'], ['Japan', '+81'], ['Jordan', '+962'],
  ['Kenya', '+254'], ['Kuwait', '+965'], ['Kyrgyzstan', '+996'], ['Laos', '+856'], ['Latvia', '+371'],
  ['Lebanon', '+961'], ['Libya', '+218'], ['Lithuania', '+370'], ['Luxembourg', '+352'], ['Macau', '+853'],
  ['Malaysia', '+60'], ['Maldives', '+960'], ['Malta', '+356'], ['Mauritius', '+230'], ['Mexico', '+52'],
  ['Mongolia', '+976'], ['Morocco', '+212'], ['Myanmar', '+95'], ['Nepal', '+977'], ['Netherlands', '+31'],
  ['New Zealand', '+64'], ['Nigeria', '+234'], ['Norway', '+47'], ['Oman', '+968'], ['Pakistan', '+92'],
  ['Panama', '+507'], ['Peru', '+51'], ['Philippines', '+63'], ['Poland', '+48'], ['Portugal', '+351'],
  ['Qatar', '+974'], ['Romania', '+40'], ['Russia / Kazakhstan', '+7'], ['Saudi Arabia', '+966'], ['Serbia', '+381'],
  ['Singapore', '+65'], ['Slovakia', '+421'], ['Slovenia', '+386'], ['South Africa', '+27'], ['South Korea', '+82'],
  ['Spain', '+34'], ['Sri Lanka', '+94'], ['Sweden', '+46'], ['Switzerland', '+41'], ['Taiwan', '+886'],
  ['Tajikistan', '+992'], ['Tanzania', '+255'], ['Thailand', '+66'], ['Tunisia', '+216'], ['Turkey', '+90'],
  ['Uganda', '+256'], ['Ukraine', '+380'], ['United Arab Emirates', '+971'], ['United Kingdom', '+44'],
  ['United States / Canada', '+1'], ['Uruguay', '+598'], ['Uzbekistan', '+998'], ['Venezuela', '+58'],
  ['Vietnam', '+84'], ['Yemen', '+967'], ['Zambia', '+260'], ['Zimbabwe', '+263'],
]

export const countryCodes = [
  { code: DEFAULT_COUNTRY_CODE, country: 'India' },
  ...OTHER_COUNTRIES.map(([country, code]) => ({ code, country })).sort((a, b) => a.country.localeCompare(b.country)),
]

// A national number is 4-14 digits worldwide (E.164 caps the whole number at 15 including the code).
// India is stricter: exactly 10 digits and a mobile number starts with 6-9.
export const PHONE_RULES = {
  '+91': { max: 10, pattern: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit mobile number' },
}
export const DEFAULT_PHONE_RULE = { max: 14, pattern: /^\d{4,14}$/, message: 'Enter a valid phone number (4-14 digits)' }
export const phoneRuleFor = (code) => PHONE_RULES[code] || DEFAULT_PHONE_RULE
export const isValidPhone = (code, number) => phoneRuleFor(code).pattern.test(String(number ?? '').replace(/\s/g, ''))

// Phone numbers are stored as the code and number run together: "+919998832823".
export const joinPhone = (code, number) => (number ? `${code || DEFAULT_COUNTRY_CODE}${number}` : '')

const codesLongestFirst = [...countryCodes].sort((a, b) => b.code.length - a.code.length)

// Splits a stored number back into { code, number }. Older records hold only the Indian national number
// ("9998832823", or "919998832823"), so anything without a recognised "+code" is read as India.
export function splitPhone(value) {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) {
    const match = codesLongestFirst.find(({ code }) => digits.startsWith(code.slice(1)))
    if (match) return { code: match.code, number: digits.slice(match.code.length - 1) }
  }
  if (digits.length === 12 && digits.startsWith('91')) return { code: DEFAULT_COUNTRY_CODE, number: digits.slice(2) }
  return { code: DEFAULT_COUNTRY_CODE, number: digits }
}

export const normalizePhone = (value) => {
  const { code, number } = splitPhone(value)
  return joinPhone(code, number)
}
