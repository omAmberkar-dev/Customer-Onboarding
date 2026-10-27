import { Link } from 'react-router-dom'
import { Mail, Phone } from 'lucide-react'
import PageContainer from './PageContainer'

export default function Footer() {
  return (
    <footer className="no-print relative z-10 border-t border-slate-200 bg-white">
      <PageContainer className="flex flex-col gap-4 py-5 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-bold text-navy-900">Need help?</p>
          <a href="mailto:customer.support@customeronboarding.example" className="flex min-h-8 items-center gap-1.5 transition hover:text-brand-600"><Mail size={14} /> customer.support@customeronboarding.example</a>
          <a href="tel:+911800123456" className="flex min-h-8 items-center gap-1.5 transition hover:text-brand-600"><Phone size={14} /> 1800 123 456</a>
        </div>
        <div className="flex gap-5"><Link className="hover:text-brand-600" to="/">Privacy policy</Link><Link className="hover:text-brand-600" to="/">Terms of use</Link></div>
      </PageContainer>
    </footer>
  )
}
