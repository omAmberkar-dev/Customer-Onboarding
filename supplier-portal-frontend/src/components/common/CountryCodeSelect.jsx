import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { countryCodes } from '../../data/countryCodes'

const POPOVER_WIDTH = 288
const LIST_MAX_HEIGHT = 240
const SEARCH_HEIGHT = 44

// A compact country-code picker: the closed control shows just the code ("+91"); opening it lists every
// country with its code, and the list can be searched by name or code. The list is drawn in a portal so it is
// never clipped by a scrolling form or popup, and it opens upwards when there is no room below.
export default function CountryCodeSelect({ id, value, onChange, invalid = false, disabled = false, controlClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState(null)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const selected = countryCodes.find((entry) => entry.code === value)
  const results = useMemo(() => {
    const text = query.trim().toLowerCase().replace(/^\+/, '')
    if (!text) return countryCodes
    return countryCodes.filter(({ code, country }) => country.toLowerCase().includes(text) || code.slice(1).startsWith(text))
  }, [query])

  const openPopover = () => {
    const rect = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const flip = below < LIST_MAX_HEIGHT + SEARCH_HEIGHT && above > below
    const room = (flip ? above : below) - SEARCH_HEIGHT
    setPlacement({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      listHeight: Math.max(120, Math.min(LIST_MAX_HEIGHT, room)),
    })
    setQuery('')
    setActive(Math.max(0, countryCodes.findIndex((entry) => entry.code === value)))
    setOpen(true)
  }

  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const choose = (entry) => {
    onChange(entry.code)
    close(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!popoverRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close()
    }
    const onScroll = (event) => { if (!popoverRef.current?.contains(event.target)) close() }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (results[active]) choose(results[active])
    } else if (event.key === 'Escape') {
      // Keep Escape for this list; an enclosing popup would otherwise close as well.
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Country code, ${selected ? `${selected.country} ${value}` : value}`}
        aria-invalid={invalid || undefined}
        title={selected?.country}
        disabled={disabled}
        onClick={() => (open ? close() : openPopover())}
        className={`app-field flex items-center justify-between gap-1 text-left ${controlClassName}`}
      >
        <span className="font-semibold tabular-nums">{value}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && placement && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', zIndex: 100, width: POPOVER_WIDTH, left: placement.left, top: placement.top, bottom: placement.bottom }}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(16,42,76,0.18)]"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3" style={{ height: SEARCH_HEIGHT }}>
            <Search size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0) }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search country or code"
              aria-label="Search countries"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-navy-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Country codes" className="overflow-y-auto p-1" style={{ maxHeight: placement.listHeight }}>
            {results.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">No matching country</li>}
            {results.map((entry, index) => {
              const isSelected = entry.code === value
              return (
                <li
                  key={entry.code}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${index === active ? 'bg-brand-50' : ''} ${isSelected ? 'font-bold text-brand-700' : 'text-navy-900'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.country}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{entry.code}</span>
                  <Check size={14} className={`shrink-0 text-brand-600 ${isSelected ? '' : 'invisible'}`} aria-hidden="true" />
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
