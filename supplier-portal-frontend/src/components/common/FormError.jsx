import { AlertCircle } from 'lucide-react'

export default function FormError({ count }) {
  if (!count) return null
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 shrink-0" size={18} />
      <div><p className="font-semibold">Please review this step</p><p className="mt-0.5 text-red-700">{count} {count === 1 ? 'field needs' : 'fields need'} your attention before you continue.</p></div>
    </div>
  )
}
