// The signed-in customer's name as the portal shows it: their own name, else the company's, else the email.
export const displayName = (profile, user) => String(profile?.name || profile?.vendor_legal_name || user?.email || 'Customer').trim()

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Who the greeting addresses ("Hello, …!"): a person by their first name, but a company by its whole name. Most accounts
// carry the company's name in `name` too, and "Hello, Aditya!" for Aditya Birla Capital Limited reads as a person.
export function greetingName(profile, user) {
  const person = String(profile?.name || '').trim()
  if (person && !same(person, profile?.vendor_legal_name)) return person.split(/\s+/)[0]
  return displayName(profile, user)
}
