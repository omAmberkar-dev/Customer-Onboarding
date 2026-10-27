import { createContext, useContext } from 'react'

// The fields a maker/checker sent back, for the form to highlight. `flags` is { [formFieldName]: flag } where a flag
// is { label, reasons, status } and status is 'open' (still to deal with), 'changed' (the vendor edited it) or
// 'confirmed' (the vendor checked it and says it is right as entered).
export const FlagsContext = createContext({ flags: {}, confirm: () => {}, unconfirm: () => {} })

export const useFlags = () => useContext(FlagsContext)
export const useFlag = (name) => useContext(FlagsContext).flags[name] || null
export const flagClass = (flag) => (flag?.status === 'open' ? 'app-field--flagged' : '')
