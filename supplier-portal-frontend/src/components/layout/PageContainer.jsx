export default function PageContainer({ className = '', wide = false, children }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-none px-2 sm:px-3 lg:px-4' : 'max-w-[1440px] px-4 sm:px-6 lg:px-8'} ${className}`}>
      {children}
    </div>
  )
}
