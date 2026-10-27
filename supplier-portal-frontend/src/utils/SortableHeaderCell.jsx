const ARROWS = { none: '↕', asc: '↑', desc: '↓' }

export default function SortableHeaderCell({ label, active, direction, onSort, className = '', align = 'left' }) {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <th className={className} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={onSort} className={`inline-flex w-full items-center gap-1 uppercase tracking-[inherit] transition-colors hover:text-[#0046dc] ${justify} ${active ? 'text-[#0046dc]' : ''}`}>
        <span>{label}</span>
        <span aria-hidden="true" className={active ? '' : 'opacity-60'}>{ARROWS[active ? direction : 'none']}</span>
      </button>
    </th>
  )
}
