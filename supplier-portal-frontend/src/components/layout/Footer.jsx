import { Mail } from 'lucide-react'
import PageContainer from './PageContainer'
import { SUPPORT_EMAIL } from './navigation'

// The footer of pages outside the app shell (Not found): the support mailbox, as in the shell's footer.
export default function Footer() {
  return (
    <footer className="no-print relative z-10 border-t border-slate-200 bg-white">
      <PageContainer className="flex flex-wrap items-center gap-x-4 gap-y-2 py-5 text-xs text-slate-500">
        <p className="font-bold text-navy-900">Need help?</p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="flex min-h-8 items-center gap-1.5 transition hover:text-brand-600"><Mail size={14} /> {SUPPORT_EMAIL}</a>
      </PageContainer>
    </footer>
  )
}
