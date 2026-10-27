import { useCallback, useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 2500
const RETRY_MS = [5000, 10000, 20000, 30000]

// Saves a form in the background once the user pauses typing. `value` is the form's current values (any object); a save runs only
// when it differs from what was last saved, never two at once, and edits made while one is running are saved right after it.
// A failed save is retried with a growing pause and never interrupts the user. The tab being hidden or closed saves at once.
// `save(value)` does the actual write and throws on failure; `enabled` pauses everything (a manual save, a submit in progress).
// Nothing is saved until the user changes something: the first value seen is taken as already saved.
export default function useAutosave({ value, save, enabled = true, onSaved }) {
  const [status, setStatus] = useState('idle') // idle | saving | error
  const serialized = JSON.stringify(value)
  const latest = useRef({ value, serialized })
  const lastSaved = useRef(serialized)
  const timer = useRef(null)
  const running = useRef(false)
  const failures = useRef(0)
  const saveRef = useRef(save)
  const onSavedRef = useRef(onSaved)
  const enabledRef = useRef(enabled)
  const mounted = useRef(true)

  useEffect(() => {
    latest.current = { value, serialized }
    saveRef.current = save
    onSavedRef.current = onSaved
    enabledRef.current = enabled
  })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  const run = useCallback(async () => {
    clear()
    if (running.current || !enabledRef.current) return
    const { value: toSave, serialized: toSaveSerialized } = latest.current
    if (toSaveSerialized === lastSaved.current) return
    running.current = true
    if (mounted.current) setStatus('saving')
    let ok = false
    try {
      await saveRef.current(toSave)
      lastSaved.current = toSaveSerialized
      failures.current = 0
      ok = true
      if (mounted.current) { setStatus('idle'); onSavedRef.current?.() }
    } catch {
      failures.current += 1
      if (mounted.current) setStatus('error')
    } finally {
      running.current = false
    }
    // More was typed while saving (or the save failed): go again, quickly after a change, slowly after a failure.
    if (!mounted.current || latest.current.serialized === lastSaved.current) return
    const wait = ok ? DEBOUNCE_MS : RETRY_MS[Math.min(failures.current, RETRY_MS.length) - 1]
    timer.current = setTimeout(() => runRef.current(), wait)
  }, [])
  const runRef = useRef(run)
  useEffect(() => { runRef.current = run }, [run])

  // A change (or being enabled again) starts the countdown; further typing restarts it.
  useEffect(() => {
    clear()
    if (!enabled || serialized === lastSaved.current) return undefined
    timer.current = setTimeout(run, failures.current > 0 ? RETRY_MS[Math.min(failures.current, RETRY_MS.length) - 1] : DEBOUNCE_MS)
    return clear
  }, [serialized, enabled, run])

  // Leaving the tab (switching away, closing it) saves what is pending straight away.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') run() }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', run)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', run)
    }
  }, [run])

  // For a save made some other way (the Save draft button, Continue): what was saved is now the baseline.
  const markSaved = useCallback((saved) => {
    lastSaved.current = JSON.stringify(saved)
    failures.current = 0
    setStatus('idle')
  }, [])

  return { status, markSaved }
}
