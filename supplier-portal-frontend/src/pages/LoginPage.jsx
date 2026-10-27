import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, BadgeCheck, Building2, Check, Eye, EyeOff, Landmark, RefreshCw, ShieldCheck } from 'lucide-react'
import AppLogo from '../components/common/AppLogo'
import Loader from '../components/common/Loader'
import SignupModal from '../components/auth/SignupModal'
import useAuth from '../hooks/useAuth'
import { getVendorProfile, loginVendor } from '../api/vendorApi'
import { homeForStage } from '../utils/stages'

const applicationSteps = [
  ['1', 'Tell us about your business', 'Company, tax and contact information'],
  ['2', 'Add your payment details', 'Registered address and bank details'],
  ['3', 'Review and submit', 'Check your information before sending'],
]

const readyItems = [
  { icon: Building2, label: 'Company details' },
  { icon: BadgeCheck, label: 'PAN & GSTIN' },
  { icon: Landmark, label: 'Bank details' },
]

const CAPTCHA_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function createCaptcha() {
  return Array.from({ length: 5 }, () => CAPTCHA_CHARACTERS[Math.floor(Math.random() * CAPTCHA_CHARACTERS.length)]).join('')
}

export default function LoginPage() {
  const { login, logout, updateProfile, isAuthenticated, stage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // A rejected vendor can come back here from their status page to start a new application.
  const [signupOpen, setSignupOpen] = useState(Boolean(location.state?.startNewApplication))
  // Set when the login was right but the application was rejected: the reasons, and a way to start again.
  const [rejected, setRejected] = useState(null)
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaCode, setCaptchaCode] = useState(createCaptcha)
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaError, setCaptchaError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = () => {
    setCaptchaCode(createCaptcha())
    setCaptchaInput('')
    setCaptchaError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    if (!captchaInput.trim()) {
      setCaptchaError('Enter the security code shown.')
      return
    }
    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      setCaptchaError('The security code does not match. Please try again.')
      setCaptchaCode(createCaptcha())
      setCaptchaInput('')
      return
    }

    setError('')
    setRejected(null)
    setCaptchaError('')
    setSubmitting(true)
    try {
      const session = await loginVendor(normalizedEmail, password)
      // The session token is stored by login(); the vendor's record is then read with it. Where they land depends
      // on their stage: the application form, the progress page, or (once approved) invoices.
      login({ email: session.email || normalizedEmail, vendorId: session.vendor_id, token: session.token })
      const profile = await getVendorProfile()
      updateProfile(profile)
      navigate(homeForStage(profile.stage), { replace: true })
    } catch (requestError) {
      logout()
      if (requestError?.code === 'application_rejected') {
        // No session for a rejected application: the vendor is told why instead, and can start a new one.
        setRejected(true)
      } else {
        setError(requestError?.status === 401
          ? 'Invalid email or password.'
          : requestError?.message || 'Unable to connect to the server. Please try again.')
      }
      refreshCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  // After signing up, drop the vendor at the login form with their email filled in.
  const handleSignedUp = (signedUpEmail) => {
    setSignupOpen(false)
    // The new account replaces the rejected application, so its message and any earlier error no longer apply.
    setRejected(null)
    setError('')
    setEmail(signedUpEmail)
    setPassword('')
    refreshCaptcha()
    setTimeout(() => document.getElementById('login-password')?.focus(), 0)
  }

  if (isAuthenticated && stage) return <Navigate to={homeForStage(stage)} replace />

  return (
    <main className="vendor-login">
      <section className="vendor-login__welcome">
        <AppLogo light />

        <div className="vendor-login__welcome-body">
          <span className="vendor-login__kicker">Customer self-onboarding</span>
          <h1>Become a customer.<br />Start here.</h1>
          <p>
            Send us the information we need to create your customer account. The guided application is
            simple, secure, and you can save your progress along the way.
          </p>

          <ol className="vendor-login__steps">
            {applicationSteps.map(([number, title, detail]) => (
              <li key={number}>
                <span>{number}</span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </li>
            ))}
          </ol>
        </div>

        <div className="vendor-login__privacy">
          <ShieldCheck size={18} />
          <span><strong>Your information stays protected.</strong> Details are securely shared with our onboarding team.</span>
        </div>
      </section>

      <section className="vendor-login__panel">
        <form className="vendor-login__card" onSubmit={handleSubmit} noValidate>
          <div className="vendor-login__start">
            <span className="vendor-login__start-icon"><BadgeCheck size={24} /></span>
            <span className="vendor-login__kicker">New customer</span>
            <h2>Start your application</h2>
            <p>Have these details ready. Most customers finish in about 10–15 minutes.</p>

            <div className="vendor-login__ready-list">
              {readyItems.map(({ icon: Icon, label }) => (
                <span key={label}><Icon size={15} /> {label}</span>
              ))}
            </div>

            <button type="button" className="vendor-login__primary" onClick={() => setSignupOpen(true)}>
              Start customer application <ArrowRight size={18} />
            </button>
          </div>

          <div className="vendor-login__divider"><span>Already have an account?</span></div>

          <div className="vendor-login__signin">
            <div className="vendor-login__signin-heading">
              <div><h3>Login to your account</h3><p>Continue your application, or access invoices and your customer profile.</p></div>
              <Check size={17} aria-hidden="true" />
            </div>

            <div className="vendor-login__field">
              <label htmlFor="login-email">Email address</label>
              <input id="login-email" type="email" autoComplete="email" placeholder="you@company.com"
                value={email} onChange={(event) => { setEmail(event.target.value); setRejected(null) }} aria-invalid={Boolean(error)} required />
            </div>

            <div className="vendor-login__field">
              <label htmlFor="login-password">Password</label>
              <div className="vendor-login__password">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(error)} required />
                <button type="button" onClick={() => setShowPassword((show) => !show)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="vendor-login__field vendor-login__captcha-field">
              <label htmlFor="login-captcha">Security check <span aria-hidden="true">*</span></label>
              <div className="vendor-login__captcha-row">
                <div className="vendor-login__captcha" aria-label={`Security code: ${captchaCode}`}>
                  <span className="vendor-login__captcha-code" aria-hidden="true">
                    {[...captchaCode].map((character, index) => <i key={`${character}-${index}`}>{character}</i>)}
                  </span>
                  <button type="button" onClick={refreshCaptcha} aria-label="Generate a new security code" title="New code">
                    <RefreshCw size={16} />
                  </button>
                </div>
                <input
                  id="login-captcha"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Enter the code"
                  value={captchaInput}
                  onChange={(event) => {
                    setCaptchaInput(event.target.value.toUpperCase())
                    if (captchaError) setCaptchaError('')
                  }}
                  aria-invalid={Boolean(captchaError)}
                  aria-describedby="captcha-help"
                  maxLength={5}
                  required
                />
              </div>
              <p id="captcha-help" className={captchaError ? 'vendor-login__captcha-error' : 'vendor-login__captcha-help'}>
                {captchaError || 'Not case-sensitive.'}
              </p>
            </div>

            {error && <div className="vendor-login__error" role="alert">{error}</div>}

            {rejected && (
              <div className="vendor-login__error" role="alert">
                <p className="flex items-center gap-1.5 font-bold"><AlertCircle size={14} /> Your application was not approved</p>
                <p className="mt-1.5 font-medium">This application is closed, and the reason was sent to your email. You can apply again with a new application.</p>
                <button type="button" onClick={() => setSignupOpen(true)} className="mt-2 font-bold underline underline-offset-2">
                  Start a new application
                </button>
              </div>
            )}

            <button type="submit" className="vendor-login__secondary" disabled={submitting}>
              {submitting ? <><Loader /> Logging in…</> : <>Login <ArrowRight size={17} /></>}
            </button>
          </div>
        </form>
      </section>
      <SignupModal open={signupOpen} onClose={() => setSignupOpen(false)} onSignedUp={handleSignedUp} initialEmail={email.trim()} />
    </main>
  )
}
