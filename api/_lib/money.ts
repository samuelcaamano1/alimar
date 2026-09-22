const MAX_DATABASE_PRICE = 9_999_999_999.99

export function parseAdminMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null

  const raw = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/^\$/, '')

  if (!raw) return null
  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return Number.NaN

  const commaIndex = raw.lastIndexOf(',')
  const dotIndex = raw.lastIndexOf('.')
  let normalized = raw

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','

    normalized = raw.split(thousandsSeparator).join('')
    normalized = normalized.replace(decimalSeparator, '.')
  } else {
    const separator = commaIndex >= 0 ? ',' : dotIndex >= 0 ? '.' : null

    if (separator) {
      const parts = raw.split(separator)

      if (parts.length > 2) {
        const looksLikeThousands = parts.slice(1).every((part) => part.length === 3)
        if (!looksLikeThousands) return Number.NaN
        normalized = parts.join('')
      } else {
        const [whole, fraction = ''] = parts

        if (fraction.length === 3) {
          normalized = `${whole}${fraction}`
        } else if (fraction.length >= 1 && fraction.length <= 2) {
          normalized = `${whole}.${fraction}`
        } else {
          return Number.NaN
        }
      }
    }
  }

  const amount = Number(normalized)

  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_DATABASE_PRICE) {
    return Number.NaN
  }

  return amount
}
