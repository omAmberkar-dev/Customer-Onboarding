import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './auth-context'
import { AUTH_EXPIRED_EVENT, getVendorProfile } from '../api/vendorApi'

const AUTH_KEY = 'vendor-onboarding-auth'

// A stored session without a token is from before vendor sign-in was token based, so it no longer counts.
function readStoredUser() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_KEY))
    return stored?.token ? stored : null
  } catch { return null }
}

// The signed-in vendor. `profile` is their own record from the server and carries `stage`
// (draft, returned, maker_review, checker_review, approved, rejected, active), which decides what they can use.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(() => Boolean(readStoredUser()))

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY)
    setUser(null)
    setProfile(null)
    setProfileLoading(false)
  }, [])

  const login = useCallback(({ email, vendorId, token, profile: vendorProfile = null }) => {
    const nextUser = { email, role: 'user', vendor_id: vendorId, token }
    localStorage.setItem(AUTH_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
    setProfile(vendorProfile)
    setProfileLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    const fresh = await getVendorProfile()
    setProfile(fresh)
    return fresh
  }, [])

  // After a page reload only the token is stored, so the vendor's record (and stage) is loaded again.
  useEffect(() => {
    if (!user || profile) return undefined
    let ignore = false
    setProfileLoading(true)
    getVendorProfile()
      .then((fresh) => { if (!ignore) setProfile(fresh) })
      .catch(() => {}) // a 401 signs the vendor out through AUTH_EXPIRED_EVENT; other errors leave them on the page
      .finally(() => { if (!ignore) setProfileLoading(false) })
    return () => { ignore = true }
  }, [user, profile])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout)
  }, [logout])

  const value = useMemo(() => ({
    user,
    profile,
    stage: profile?.stage || null,
    profileLoading,
    isAuthenticated: Boolean(user),
    login,
    refreshProfile,
    updateProfile: setProfile,
    logout,
  }), [user, profile, profileLoading, login, refreshProfile, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
