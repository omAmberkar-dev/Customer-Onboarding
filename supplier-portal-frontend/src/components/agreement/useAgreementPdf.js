import { useCallback, useEffect, useState } from 'react'
import { fetchAgreementPdfBlob } from '../../api/vendorApi'

// Loads an agreement PDF behind the vendor's token as a blob: URL (revoked on cleanup), with its page count when it
// can be read from the file. `retry()` tries again after an error.
export default function useAgreementPdf(agreementId) {
  const [state, setState] = useState({ url: '', error: '', pages: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    let created = ''
    setState({ url: '', error: '', pages: null })
    fetchAgreementPdfBlob(agreementId)
      .then(async (blob) => {
        if (ignore) return
        const pdf = new Blob([blob], { type: 'application/pdf' })
        created = URL.createObjectURL(pdf)
        let pages = null
        try {
          const text = new TextDecoder('latin1').decode(await pdf.arrayBuffer())
          pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length || null
        } catch { /* the count is optional */ }
        if (ignore) URL.revokeObjectURL(created)
        else setState({ url: created, error: '', pages })
      })
      .catch((err) => { if (!ignore) setState({ url: '', error: err.message || 'Unable to load the agreement.', pages: null }) })
    return () => {
      ignore = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [agreementId, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { ...state, retry }
}
