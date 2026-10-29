import { FileText, Home, Landmark, LifeBuoy, Replace, UserRound } from 'lucide-react'

// The support mailbox, as the backend's SUPPORT_EMAIL (app.py) and its emails name it. No phone line is configured.
export const SUPPORT_EMAIL = 'support@fourthsignal.com'

// The sidebar's sections, in order. `profile: true` opens the profile panel instead of a page; `group: 'account'` sits
// below the divider. `match` lists the other paths that keep the item active.
// Agreement is left out for this release (its pages and routes stay, for renewal links and onboarding).
export const NAV_ITEMS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/loans', label: 'Loans & Sanctions', icon: Landmark },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/update-requests', label: 'Change Requests', icon: Replace },
  { label: 'Profile', icon: UserRound, profile: true, group: 'account' },
  { to: '/support', label: 'Support', icon: LifeBuoy, group: 'account' },
]

export const isActivePath = (item, pathname) =>
  Boolean(item.to) && (pathname === item.to || (item.match || []).some((prefix) => pathname.startsWith(prefix)))
