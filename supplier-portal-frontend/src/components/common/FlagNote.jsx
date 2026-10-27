import { AlertTriangle, Check, CheckCircle2, Undo2 } from 'lucide-react'
import { useFlags } from '../../context/flags-context'

// Under a field the maker or checker flagged: why it was sent back, and how the vendor has dealt with it.
// `name` is the form field name; `flag` (with onConfirm/onUnconfirm) is for things that are not form fields, like documents.
export default function FlagNote({ name, flag: flagProp, onConfirm, onUnconfirm }) {
  const { flags, confirm, unconfirm } = useFlags()
  const flag = flagProp || flags[name]
  if (!flag) return null
  const markCorrect = onConfirm || (() => confirm(name))
  const undo = onUnconfirm || (() => unconfirm(name))

  if (flag.status === 'changed') {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <Check size={12} aria-hidden="true" /> Updated. It will be checked again when you resubmit.
      </p>
    )
  }
  if (flag.status === 'confirmed') {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-emerald-700">
        <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" /> Marked as correct as entered.</span>
        <button type="button" onClick={undo} className="inline-flex items-center gap-1 text-slate-500 underline underline-offset-2 hover:text-brand-700">
          <Undo2 size={11} aria-hidden="true" /> Undo
        </button>
      </p>
    )
  }
  return (
    <div role="note" className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-800">
      <p className="flex items-center gap-1 font-bold"><AlertTriangle size={12} aria-hidden="true" /> Needs your attention</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {flag.reasons.map((reason, index) => (
          <li key={index}>{reason.label}{reason.remark && <span className="text-red-700/80">: {reason.remark}</span>}</li>
        ))}
      </ul>
      <button type="button" onClick={markCorrect} className="mt-1.5 font-semibold text-red-900 underline underline-offset-2 hover:text-brand-700">
        This is correct as entered
      </button>
    </div>
  )
}
