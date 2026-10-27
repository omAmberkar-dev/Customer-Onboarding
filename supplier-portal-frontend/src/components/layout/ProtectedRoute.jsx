import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import Loader from '../common/Loader'
import Button from '../common/Button'
import { homeForStage } from '../../utils/stages'

// Signed-in vendors only, and only for the stages a page is meant for: e.g. invoices need an active vendor, the
// application form needs a draft or returned one. Anyone else is sent to the page their stage belongs on.
export default function ProtectedRoute({ children, stages }) {
  const { isAuthenticated, profile, stage, profileLoading, refreshProfile, logout } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/" replace state={{ from: location }} />

  if (!profile) {
    if (profileLoading) {
      return <div className="grid min-h-screen place-items-center text-brand-600" role="status" aria-label="Loading"><Loader /></div>
    }
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="text-sm font-semibold text-navy-900">We couldn’t load your account.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => refreshProfile().catch(() => {})}>Try again</Button>
            <Button variant="secondary" onClick={logout}>Log out</Button>
          </div>
        </div>
      </div>
    )
  }

  if (stages && !stages.includes(stage)) return <Navigate to={homeForStage(stage)} replace />
  return children
}
