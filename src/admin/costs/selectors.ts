import type { AdminQuote, QuoteStatus } from '../../adminQuotePrint'
import { categoryLabels } from './config'
import type {
  CostCategory,
  CostResource,
  QuoteFocusFilter,
} from './types'
import { daysUntil } from './utils'

export function filterCostResources(
  resources: CostResource[],
  search: string,
  categoryFilter: 'all' | CostCategory,
) {
  const query = search.trim().toLocaleLowerCase('es-AR')

  return resources.filter((resource) => {
    if (categoryFilter !== 'all' && resource.category !== categoryFilter) {
      return false
    }
    if (!query) return true

    return [
      resource.name,
      resource.detail ?? '',
      resource.notes ?? '',
      categoryLabels[resource.category],
    ]
      .join(' ')
      .toLocaleLowerCase('es-AR')
      .includes(query)
  })
}

export function getQuoteFollowUpCounts(quotes: AdminQuote[]) {
  const waiting = quotes.filter((quote) => quote.status === 'sent').length
  const expiring = quotes.filter((quote) => {
    const days = daysUntil(quote.valid_until)
    return (
      (quote.status === 'draft' || quote.status === 'sent') &&
      days !== null &&
      days >= 0 &&
      days <= 3
    )
  }).length
  const accepted = quotes.filter(
    (quote) => quote.status === 'accepted' && !quote.order_code,
  ).length
  const expired = quotes.filter((quote) => quote.status === 'expired').length

  return {
    all: quotes.length,
    waiting,
    expiring,
    accepted,
    expired,
    attention: expiring + accepted,
  }
}

export function filterQuotes(
  quotes: AdminQuote[],
  args: {
    search: string
    statusFilter: 'all' | QuoteStatus
    focusFilter: QuoteFocusFilter
  },
) {
  const query = args.search.trim().toLocaleLowerCase('es-AR')

  return quotes.filter((quote) => {
    if (
      args.statusFilter !== 'all' &&
      quote.status !== args.statusFilter
    ) {
      return false
    }

    if (args.focusFilter === 'waiting' && quote.status !== 'sent') {
      return false
    }

    if (args.focusFilter === 'accepted') {
      if (quote.status !== 'accepted' || quote.order_code) return false
    }

    if (args.focusFilter === 'expired' && quote.status !== 'expired') {
      return false
    }

    if (args.focusFilter === 'expiring') {
      const days = daysUntil(quote.valid_until)
      if (
        !(
          (quote.status === 'draft' || quote.status === 'sent') &&
          days !== null &&
          days >= 0 &&
          days <= 3
        )
      ) {
        return false
      }
    }

    if (!query) return true

    return [
      quote.public_code,
      quote.title,
      quote.customer_name ?? '',
      quote.customer_phone ?? '',
      quote.snapshot.jobLabel,
    ]
      .join(' ')
      .toLocaleLowerCase('es-AR')
      .includes(query)
  })
}
