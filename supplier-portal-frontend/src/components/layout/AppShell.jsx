import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Handshake, Home, Landmark, LogOut, ReceiptText, Replace } from 'lucide-react'
import AppLogo from '../common/AppLogo'
import useAuth from '../../hooks/useAuth'
import VendorProfilePanel from './VendorProfilePanel'
import AgreementBanner from './AgreementBanner'
import { OPEN_PROFILE_EVENT } from '../../utils/events'
import { STAGES, WAITING_STAGES, homeForStage } from '../../utils/stages'

const NAV_ITEMS = [
  { to: '/loans', label: 'My loans', icon: Landmark },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/agreements', label: 'Agreement', icon: Handshake },
  { to: '/update-requests', label: 'Change Requests', icon: Replace },
]

export default function AppShell({ breadcrumb, children, backTo, onBack }) {
  const { logout, user, profile, stage, updateProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  // Invoices, change requests and the editable profile only exist once the vendor is active; until then the
  // vendor just follows their application.
  const isActive = stage === STAGES.active
  // While the application is being reviewed the vendor can still look at what they submitted, but not change it.
  const canViewProfile = isActive || WAITING_STAGES.includes(stage)
  const showSidebar = isActive && !backTo
  const homePath = homeForStage(stage)

  // Pages can ask for the profile to open (e.g. "View submitted application" on the status page).
  useEffect(() => {
    if (!canViewProfile) return undefined
    const open = () => setProfileOpen(true)
    window.addEventListener(OPEN_PROFILE_EVENT, open)
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, open)
  }, [canViewProfile])

  const handleSignOut = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="app-shell relative flex min-h-screen flex-col overflow-hidden bg-[#f1f4f8]">
      {/* The navbar (the LAS layout): brand, breadcrumb, then home and the signed-in customer with log out. */}
      {!backTo && <header className="no-print sticky top-0 z-30 border-b border-[#d8e0e9] bg-white shadow-[var(--shadow-xs)]">
        <div className="flex h-16 w-full items-center justify-between gap-4 pl-4 pr-[18px]">
          <div className="flex min-w-0 items-center gap-4">
            <AppLogo compact />
            <div className="hidden h-7 w-px bg-[#d8e0e9] sm:block" aria-hidden="true" />
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-[12.5px] font-medium text-black/65 sm:flex">
              {isActive
                ? <Link to={homePath} className="transition hover:text-brand-600">Workspace</Link>
                : <span>Workspace</span>}
              <ChevronRight size={14} className="text-black/40" />
              <span className="truncate font-semibold text-black">{breadcrumb || 'Customer Onboarding'}</span>
            </nav>
          </div>

          <div className="flex items-center gap-1">
            {/* Without the sidebar (before onboarding is approved) My loans is reached from here. */}
            {!isActive && (
              <Link
                to="/loans"
                aria-label="My loans"
                title="My loans"
                aria-current={location.pathname === '/loans' ? 'page' : undefined}
                className="interactive-icon"
              >
                <Landmark size={17} />
              </Link>
            )}
            {isActive && (
              <Link
                to={homePath}
                aria-label="Workspace home"
                title="Workspace home"
                className="interactive-icon"
              >
                <Home size={17} />
              </Link>
            )}
            <div className="ml-2 flex items-center gap-3 border-l border-[#d8e0e9] pl-4">
              <button
                type="button"
                onClick={() => canViewProfile && setProfileOpen(true)}
                disabled={!canViewProfile}
                className="flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg text-left transition hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
                aria-label={isActive ? 'Open customer profile' : 'View submitted application'}
                title={isActive ? undefined : 'View submitted application'}
              >
                <span className="grid size-8 place-items-center rounded-full bg-[#002880] text-xs font-bold text-white ring-2 ring-[#d8e0e9]" aria-hidden="true">
                  {(user?.email?.[0] || 'C').toUpperCase()}
                </span>
                <span className="hidden sm:block">
                  <b className="block max-w-44 truncate text-[12.5px] font-semibold leading-tight text-black">{user?.email}</b>
                  <small className="block text-[11.5px] text-black/65">Customer</small>
                </span>
              </button>
              <button onClick={handleSignOut} aria-label="Log out" title="Log out" className="interactive-icon">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </header>}

      {isActive && !backTo && <AgreementBanner />}

      <div className="relative z-10 flex min-h-0 flex-1">
        {showSidebar && (
          <aside className="group no-print sticky top-16 hidden h-[calc(100svh-4rem)] w-[72px] shrink-0 overflow-hidden border-r border-[#d8e0e9] bg-white px-3 py-4 transition-[width] duration-200 ease-out hover:w-64 focus-within:w-64 md:block" aria-label="Sections">
            {/* The LAS sidebar as an icon rail that opens (and moves the page over) while hovered or focused. The active item has a
                pale blue fill, a blue bar on its left edge and a filled icon tile. */}
            <div className="w-58">
              <p className="flex h-5 items-center gap-2 whitespace-nowrap px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-black/55 opacity-0 transition-opacity after:h-px after:flex-1 after:bg-[#d8e0e9] group-hover:opacity-100 group-focus-within:opacity-100">Workspace</p>
              <nav className="mt-1 grid gap-0.5">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to || (to === '/agreements' && location.pathname.startsWith('/agreements/'))
                  return (
                    <Link key={to} to={to} title={label} aria-label={label} aria-current={active ? 'page' : undefined} className={`relative flex min-h-[42px] w-[46px] items-center gap-3 rounded-lg px-2 py-[5px] text-[13.5px] transition-[width,background-color,color] group-hover:w-full group-focus-within:w-full ${active ? 'bg-[#dce6ff] font-semibold text-black before:absolute before:-left-3 before:inset-y-[7px] before:w-1 before:rounded-r before:bg-[#0046dc]' : 'font-medium text-black/65 hover:bg-[#f2f5fd] hover:text-black'}`}>
                      <span className={`grid size-[30px] shrink-0 place-items-center rounded-md ${active ? 'bg-[#002880] text-white' : ''}`}>
                        <Icon size={17} />
                      </span>
                      <span className="whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </aside>
        )}
        {/* While the submitted application is open beside the status page, the page makes room for it (the panel is 42rem wide). */}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-200 ${profileOpen && !isActive ? 'lg:pr-[42rem]' : ''}`}>
          {showSidebar && (
            <nav className="no-print flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/90 px-3 py-2 md:hidden" aria-label="Sections">
              {NAV_ITEMS.map(({ to, label }) => (
                <Link key={to} to={to} className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold ${location.pathname.startsWith(to) ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`}>{label}</Link>
              ))}
            </nav>
          )}
      <main className={`app-shell__main relative flex-1 min-w-0 py-2 sm:py-3 ${backTo ? 'guest-shell__main flex min-h-0 flex-col pt-3 sm:pt-4' : ''}`}>
        {backTo && (
          <div className="no-print mx-auto mb-2 w-full shrink-0 px-3 sm:px-4">
            {onBack ? (
              // The page needs to confirm first (e.g. unsaved progress would be lost), so it decides when to leave.
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-navy-900"
              >
                <ArrowLeft size={18} /> Back
              </button>
            ) : (
              <Link
                to={backTo}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-navy-900"
              >
                <ArrowLeft size={18} /> Back
              </Link>
            )}
          </div>
        )}
        {children}
      </main>
        </div>
      </div>
      <VendorProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} onProfileRefresh={updateProfile} readOnly={!isActive} />
    </div>
  )
}
