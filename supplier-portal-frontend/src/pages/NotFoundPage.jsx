import { Link } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import Footer from '../components/layout/Footer'
import PageContainer from '../components/layout/PageContainer'
import AppLogo from '../components/common/AppLogo'
import useAuth from '../hooks/useAuth'
import { homeForStage } from '../utils/stages'

export default function NotFoundPage() {
  const { isAuthenticated, stage } = useAuth()
  const homePath = homeForStage(stage)
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f1f4f8]">
      <div className="pointer-events-none absolute -right-28 top-20 size-96 rounded-full border-[60px] border-[#dce6ff]/50" aria-hidden="true" />
      <header className="relative z-10 border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
        <AppLogo compact />
      </header>
      <main className="relative z-10 grid flex-1 place-items-center py-12">
        <PageContainer className="max-w-2xl">
          <section className="rounded-2xl border border-[#b3c3e4]/80 bg-white px-6 py-12 text-center shadow-[0_22px_60px_rgba(40,83,130,0.1)] sm:px-12">
            <span className="mx-auto grid size-14 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <FileQuestion size={28} />
            </span>
            <p className="eyebrow mt-7">Error 404</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-navy-950">Page not found</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">The page you’re looking for doesn’t exist or may have moved.</p>
            <Link
              to={isAuthenticated ? homePath : '/'}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(23,105,232,0.18)] transition hover:bg-brand-700"
            >
              <ArrowLeft size={17} /> Return home
            </Link>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
