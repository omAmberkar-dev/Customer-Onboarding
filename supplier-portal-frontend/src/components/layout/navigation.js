import { ArrowLeftRight, Banknote, CalendarClock, FileText, LayoutDashboard, Landmark, LifeBuoy, Replace, UserRound, Wallet } from 'lucide-react'

// The support mailbox, as the backend's SUPPORT_EMAIL (app.py) and its emails name it. No phone line is configured.
export const SUPPORT_EMAIL = 'support@fourthsignal.com'

// The sidebar's sections, in order. `profile: true` opens the profile panel instead of a page; `group: 'account'` sits
// below the divider. `match` lists the other paths that keep the item active.
// Agreement is left out for this release (its pages and routes stay, for renewal links and onboarding).
// The Dashboard is also the financial overview (one screen, not two). Collateral comes in a later phase.
// The labels name the modules; the paths stay as they were, so links in emails and the bell keep working (Cashflows is
// /repayments, Transactions is /cashflow, Receipts is /payments). Documents is off for now (its page stays, unrouted).
export const NAV_ITEMS = [
  { to: '/home', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/loans', label: 'Loans & Sanctions', icon: Landmark },
  { to: '/drawdowns', label: 'Drawdown History', icon: Banknote },
  { to: '/repayments', label: 'Cashflows', icon: CalendarClock },
  { to: '/cashflow', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/invoices', label: 'Invoice Management', icon: FileText },
  { to: '/payments', label: 'Receipts', icon: Wallet },
  { to: '/update-requests', label: 'Change Requests', icon: Replace },
  { label: 'Profile', icon: UserRound, profile: true, group: 'account' },
  { to: '/support', label: 'Help & Support', icon: LifeBuoy, group: 'account' },
]

export const isActivePath = (item, pathname) =>
  Boolean(item.to) && (pathname === item.to || (item.match || []).some((prefix) => pathname.startsWith(prefix)))
