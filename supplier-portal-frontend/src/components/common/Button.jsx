import { forwardRef } from 'react'

const Button = forwardRef(function Button({ variant = 'primary', className = '', children, ...props }, ref) {
  const styles = {
    primary: 'border-brand-600 bg-brand-600 text-white shadow-[0_8px_20px_rgba(23,105,232,0.18)] hover:border-brand-700 hover:bg-brand-700',
    secondary: 'border-slate-300 bg-white text-navy-900 hover:border-slate-400 hover:bg-slate-50',
    ghost: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-navy-900',
    danger: 'border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50',
  }
  return (
    <button
      ref={ref}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-bold transition focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export default Button
