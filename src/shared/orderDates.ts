export const ORDER_BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function datePartsInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

export function todayOrderDate(now = new Date()) {
  return datePartsInTimeZone(now, ORDER_BUSINESS_TIME_ZONE)
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

export function validRequestedDate(value: string, now = new Date()) {
  if (!value) return true
  return isValidDateOnly(value) && value >= todayOrderDate(now)
}

export function requestedDateLabel(value: string | null) {
  if (!value || !isValidDateOnly(value)) return 'Sin fecha solicitada'

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}
