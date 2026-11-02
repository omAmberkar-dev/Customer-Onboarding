import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Landmark, LifeBuoy, LogOut, Mail, UserRound } from 'lucide-react'
import AppLogo from '../common/AppLogo'
import useAuth from '../../hooks/useAuth'
import VendorProfilePanel from './VendorProfilePanel'
import AgreementBanner from './AgreementBanner'
import NotificationBell from './NotificationBell'
import { NAV_ITEMS, SUPPORT_EMAIL, isActivePath } from './navigation'
import { OPEN_PROFILE_EVENT } from '../../utils/events'
import { STAGES, WAITING_STAGES, homeForStage } from '../../utils/stages'
import { displayName } from '../../utils/customer'

// The avatar's initials.
const initials = (name) => name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'C'

// The avatar, name and role; opens a menu with the profile and log out.
function UserMenu({ name, canViewProfile, onProfile, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const item = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-semibold text-navy-900 transition hover:bg-brand-50 hover:text-brand-700'
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex min-h-11 items-center gap-3 rounded-lg px-1.5 text-left transition hover:bg-[#f2f5fd]">
        <span className="grid size-9 place-items-center rounded-full bg-[#002880] text-xs font-bold text-white" aria-hidden="true">{initials(name)}</span>
        <span className="hidden sm:block">
          <b className="block max-w-44 truncate text-[13px] font-semibold leading-tight text-black">{name}</b>
          <small className="block text-[11.5px] text-black/60">Customer</small>
        </span>
        <ChevronDown size={16} className="hidden text-black/50 sm:block" aria-hidden="true" />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-[#d8e0e9] bg-white p-1.5 shadow-[0_12px_32px_rgba(11,55,104,0.14)]">
          {canViewProfile && <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onProfile() }}><UserRound size={16} /> My profile</button>}
          <button type="button" role="menuitem" className={item} onClick={onSignOut}><LogOut size={16} /> Log out</button>
        </div>
      )}
    </div>
  )
}

// One sidebar entry: a link, or (Profile) a button that opens the profile panel.
function NavEntry({ item, pathname, onProfile, compact = false }) {
  const Icon = item.icon
  const active = isActivePath(item, pathname)
  const cls = compact
    ? `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`
    : `flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] transition ${active ? 'bg-[#e6edff] font-semibold text-brand-700' : 'font-medium text-black/70 hover:bg-[#f2f5fd] hover:text-black'}`
  const body = <><Icon size={compact ? 15 : 18} aria-hidden="true" /> <span className="whitespace-nowrap">{item.label}</span></>
  if (item.profile) return <button type="button" onClick={onProfile} className={cls}>{body}</button>
  return <Link to={item.to} aria-current={active ? 'page' : undefined} className={cls}>{body}</Link>
}

export default function AppShell({ breadcrumb, children, backTo, onBack }) {
  const { logout, user, profile, stage, updateProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  // Every section beyond following the application exists only once the customer is active.
  const isActive = stage === STAGES.active
  // While the application is being reviewed the customer can still look at what they submitted, but not change it.
  const canViewProfile = isActive || WAITING_STAGES.includes(stage)
  const showSidebar = isActive && !backTo
  const homePath = homeForStage(stage)
  const name = displayName(profile, user)
  const openProfile = () => canViewProfile && setProfileOpen(true)

  // Pages (and the header search) ask for the profile to open with this event.
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
    <div className="app-shell relative flex min-h-screen flex-col overflow-x-clip bg-[#f1f4f8]">
      {!backTo && <header className="no-print sticky top-0 z-30 border-b border-[#d8e0e9] bg-white">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-5">
          <div className="flex min-w-0 items-center overflow-hidden">
            <AppLogo compact to={homePath} subtitle="Customer onboarding & self-service" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Without the sidebar (before onboarding is approved) My loans is reached from here. */}
            {!isActive && (
              <Link to="/loans" aria-label="My loans" title="My loans" aria-current={location.pathname === '/loans' ? 'page' : undefined} className="interactive-icon">
                <Landmark size={17} />
              </Link>
            )}
            {/* Every signed-in customer follows each stage of their workflows here, onboarding included. */}
            {user && <NotificationBell />}
            <UserMenu name={name} canViewProfile={canViewProfile} onProfile={openProfile} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>}

      {isActive && !backTo && <AgreementBanner />}

      <div className="relative z-10 flex min-h-0 flex-1">
        {showSidebar && (
          <aside className="no-print sticky top-16 hidden h-[calc(100svh-4rem)] w-[232px] shrink-0 flex-col justify-between overflow-y-auto border-r border-[#d8e0e9] bg-white px-3 py-4 lg:flex" aria-label="Sections">
            <nav className="grid gap-1">
              {NAV_ITEMS.filter((i) => i.group !== 'account').map((item) => <NavEntry key={item.label} item={item} pathname={location.pathname} onProfile={openProfile} />)}
              <div className="my-2 h-px bg-[#e5eaf1]" aria-hidden="true" />
              {NAV_ITEMS.filter((i) => i.group === 'account').map((item) => <NavEntry key={item.label} item={item} pathname={location.pathname} onProfile={openProfile} />)}
            </nav>
            <div className="mt-6 rounded-xl border border-[#d8e0e9] bg-[#f7f9fc] p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-navy-900"><LifeBuoy size={16} className="text-brand-600" /> Need help?</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">Our support team is here to assist you.</p>
              <Link to="/support" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-brand-600 bg-white px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-50">
                Contact support <ChevronRight size={14} />
              </Link>
            </div>
          </aside>
        )}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-200 ${profileOpen && !isActive ? 'lg:pr-[42rem]' : ''}`}>
          {showSidebar && (
            <nav className="no-print flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden" aria-label="Sections">
              {NAV_ITEMS.map((item) => <NavEntry key={item.label} item={item} pathname={location.pathname} onProfile={openProfile} compact />)}
            </nav>
          )}
          <main className={`app-shell__main relative flex-1 min-w-0 py-3 sm:py-4 ${backTo ? 'guest-shell__main flex min-h-0 flex-col pt-3 sm:pt-4' : ''}`}>
            {backTo && (
              <div className="no-print mx-auto mb-2 w-full shrink-0 px-3 sm:px-4">
                {onBack ? (
                  // The page needs to confirm first (e.g. unsaved progress would be lost), so it decides when to leave.
                  <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-navy-900">
                    <ArrowLeft size={18} /> Back
                  </button>
                ) : (
                  <Link to={backTo} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-navy-900">
                    <ArrowLeft size={18} /> Back
                  </Link>
                )}
              </div>
            )}
            {!backTo && breadcrumb && (
              <nav aria-label="Breadcrumb" className="no-print mx-auto mb-1 flex w-full max-w-[1440px] items-center gap-2 px-4 text-[12.5px] font-medium text-black/60 sm:px-6 lg:px-8">
                {isActive ? <Link to={homePath} className="transition hover:text-brand-600">Workspace</Link> : <span>Workspace</span>}
                <ChevronRight size={14} className="text-black/35" aria-hidden="true" />
                <span aria-current="page" className="truncate font-semibold text-black">{breadcrumb}</span>
              </nav>
            )}
            {children}
          </main>
          {!backTo && (
            <footer className="no-print border-t border-[#d8e0e9] bg-white px-4 py-3 text-xs text-slate-600 sm:px-6 lg:px-8">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="text-navy-900">Need help?</b>
                {/* The portal sends support messages itself (Support page), so this never opens an email app. */}
                <Link to="/support" className="inline-flex min-h-8 items-center gap-1.5 transition hover:text-brand-600"><Mail size={14} /> Message support ({SUPPORT_EMAIL})</Link>
              </p>
            </footer>
          )}
        </div>
      </div>
      <VendorProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} onProfileRefresh={updateProfile} readOnly={!isActive} />
    </div>
  )
}
