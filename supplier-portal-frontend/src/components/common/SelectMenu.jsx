import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import FlagNote from './FlagNote'
import { flagClass, useFlag } from '../../context/flags-context'

const LIST_MAX_HEIGHT = 240
const MIN_LIST_HEIGHT = 120
const SEARCH_HEIGHT = 44
const MIN_WIDTH = 200

// A form dropdown with a themed, searchable option list instead of the browser's native one. Same look and
// behaviour as the country-code picker: the list is drawn in a portal (never clipped by a scrolling form), opens
// below the field (upwards only when there is no room), can be filtered by typing, and works from the keyboard.
// Optional fields get a first row that clears the choice. Plugs into react-hook-form the way Input does (`register`),
// plus `watch` and `setValue` to read and set the value.
export default function SelectMenu({ label, name, register, watch, setValue, error, options, required, locked = false, placeholder = 'Select an option', className = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState(null)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()
  const errorId = error ? `${name}-error` : undefined
  const flag = useFlag(name)

  const value = watch(name) || ''
  const rows = useMemo(() => {
    const text = query.trim().toLowerCase()
    const matches = options.filter((option) => option.toLowerCase().includes(text)).map((option) => ({ value: option, label: option }))
    // Only optional fields can be cleared, and only when the list is not being searched.
    return !required && !text ? [{ value: '', label: placeholder }, ...matches] : matches
  }, [options, query, required, placeholder])

  const openList = () => {
    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.max(rect.width, MIN_WIDTH)
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    // Stay below whenever a scrollable list of a few rows fits; flip up only when there is hardly any room.
    const flip = below < SEARCH_HEIGHT + MIN_LIST_HEIGHT && above > below
    setPlacement({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      listHeight: Math.max(MIN_LIST_HEIGHT, Math.min(LIST_MAX_HEIGHT, (flip ? above : below) - SEARCH_HEIGHT)),
    })
    setQuery('')
    // The unfiltered list is the placeholder row (optional fields only) followed by every option.
    setActive(Math.max(0, options.indexOf(value) + (required ? 0 : 1)))
    setOpen(true)
  }

  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const choose = (row) => {
    setValue(name, row.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
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

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open && !locked) openList()
    }
  }

  const onSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, rows.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (rows[active]) choose(rows[active])
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
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900" htmlFor={name}>
        {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      <input type="hidden" {...register(name)} />
      <button
        ref={triggerRef}
        type="button"
        id={name}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={Boolean(error)}
        aria-required={required}
        aria-readonly={locked || undefined}
        aria-describedby={errorId}
        tabIndex={locked ? -1 : undefined}
        onClick={() => (open ? close() : !locked && openList())}
        onKeyDown={onTriggerKeyDown}
        className={`app-field flex items-center justify-between gap-2 text-left ${locked ? 'app-field--locked' : ''} ${flagClass(flag)}`}
      >
        <span className={`truncate ${value ? '' : 'text-[#8a94a6]'}`}>{value || placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && placement && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', zIndex: 100, width: placement.width, left: placement.left, top: placement.top, bottom: placement.bottom }}
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
              placeholder="Search"
              aria-label={`Search ${label}`}
              aria-controls={listId}
              aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-navy-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="overflow-y-auto p-1" style={{ maxHeight: placement.listHeight }}>
            {rows.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">No matches</li>}
            {rows.map((row, index) => {
              const isPlaceholder = row.value === ''
              // The placeholder row only clears the choice; it is never shown as the selected one.
              const isSelected = !isPlaceholder && row.value === value
              return (
                <li
                  key={row.value || 'none'}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isPlaceholder ? !value : isSelected}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${index === active ? 'bg-brand-50' : ''} ${isSelected ? 'font-bold text-brand-700' : isPlaceholder ? 'text-slate-400' : 'text-navy-900'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <Check size={14} className={`shrink-0 text-brand-600 ${isSelected ? '' : 'invisible'}`} aria-hidden="true" />
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
      {error && <p id={errorId} className="mt-1 text-[11px] font-medium text-red-600">{error.message}</p>}
      <FlagNote name={name} />
    </div>
  )
}
