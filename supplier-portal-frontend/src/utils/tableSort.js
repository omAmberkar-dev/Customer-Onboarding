const isEmpty = (value) => value === undefined || value === null || value === ''

const NUMERIC = /^-?\d+(\.\d+)?$/
const asNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  return NUMERIC.test(text) ? Number(text) : null
}

// Empty values always sort last, in both directions.
export function compareValues(a, b, direction = 'asc') {
  const aEmpty = isEmpty(a)
  const bEmpty = isEmpty(b)
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  const aNumber = asNumber(a)
  const bNumber = asNumber(b)
  const result = aNumber !== null && bNumber !== null
    ? aNumber - bNumber
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  return direction === 'desc' ? -result : result
}

// First click: ascending. Same column again: descending. A different column starts ascending.
export function nextSortState(current, key) {
  if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: 'asc' }
}

export function sortRows(rows, sort, getValue) {
  if (!sort) return rows
  return [...rows].sort((a, b) => compareValues(getValue(a, sort.key), getValue(b, sort.key), sort.direction))
}
