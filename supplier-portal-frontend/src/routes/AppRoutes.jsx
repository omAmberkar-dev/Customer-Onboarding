import { Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import InvoiceDashboardPage from '../pages/InvoiceDashboardPage'
import UpdateRequestsPage from '../pages/UpdateRequestsPage'
import VendorRequestPage from '../pages/VendorRequestPage'
import ApplicationStatusPage from '../pages/ApplicationStatusPage'
import AgreementSigningPage from '../pages/AgreementSigningPage'
import AgreementsPage from '../pages/AgreementsPage'
import MyLoansPage from '../pages/MyLoansPage'
import CashflowPage from '../pages/CashflowPage'
import DrawdownHistoryPage from '../pages/DrawdownHistoryPage'
import RepaymentSchedulePage from '../pages/RepaymentSchedulePage'
import PaymentsPage from '../pages/PaymentsPage'
import HomePage from '../pages/HomePage'
import SupportPage from '../pages/SupportPage'
import VerifyAgreementPage from '../pages/VerifyAgreementPage'
import NotFoundPage from '../pages/NotFoundPage'
import ProtectedRoute from '../components/layout/ProtectedRoute'
import { AuthProvider } from '../context/AuthContext'
import { FORM_STAGES, STAGES, WAITING_STAGES } from '../utils/stages'

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<ProtectedRoute stages={[STAGES.active]}><HomePage /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute stages={[STAGES.active]}><SupportPage /></ProtectedRoute>} />
        <Route path="/drawdowns" element={<ProtectedRoute stages={[STAGES.active]}><DrawdownHistoryPage /></ProtectedRoute>} />
        <Route path="/repayments" element={<ProtectedRoute stages={[STAGES.active]}><RepaymentSchedulePage /></ProtectedRoute>} />
        <Route path="/cashflow" element={<ProtectedRoute stages={[STAGES.active]}><CashflowPage /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute stages={[STAGES.active]}><PaymentsPage /></ProtectedRoute>} />
        {/* Documents is temporarily off: pages/DocumentsPage.jsx is kept, unrouted, so /documents falls through to NotFound. */}
        <Route path="/invoices" element={<ProtectedRoute stages={[STAGES.active]}><InvoiceDashboardPage /></ProtectedRoute>} />
        <Route path="/update-requests" element={<ProtectedRoute stages={[STAGES.active]}><UpdateRequestsPage /></ProtectedRoute>} />
        <Route path="/request-vendor" element={<ProtectedRoute stages={FORM_STAGES}><VendorRequestPage /></ProtectedRoute>} />
        <Route path="/application-status" element={<ProtectedRoute stages={WAITING_STAGES}><ApplicationStatusPage /></ProtectedRoute>} />
        <Route path="/agreement" element={<ProtectedRoute stages={[STAGES.agreement]}><AgreementSigningPage /></ProtectedRoute>} />
        <Route path="/agreements" element={<ProtectedRoute stages={[STAGES.active, STAGES.agreementSigned, STAGES.makerReview, STAGES.checkerReview, STAGES.changeRequested, STAGES.returned]}><AgreementsPage /></ProtectedRoute>} />
        <Route path="/agreements/:id/sign" element={<ProtectedRoute stages={[STAGES.active]}><AgreementSigningPage /></ProtectedRoute>} />
        {/* Every signed-in customer: before onboarding is approved it says so. */}
        <Route path="/loans" element={<ProtectedRoute><MyLoansPage /></ProtectedRoute>} />
        <Route path="/verify-agreement" element={<VerifyAgreementPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
