export type AdminCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
}

export type AdminProduct = {
  id: string
  category_id: string | null
  sort_order: number
  name: string
  slug: string
  short_description: string | null
  kind: 'service' | 'product'
  pricing_mode: 'fixed' | 'from' | 'quote'
  base_price: string | null
  customization_allowed: boolean
  featured: boolean
  image_url: string | null
}

export type AdminCatalog = {
  categories: AdminCategory[]
  products: AdminProduct[]
}

export type SessionResponse = {
  configured: boolean
  authenticated: boolean
  account: {
    id: string
    email: string
    name: string
  } | null
}

export type ImageState = {
  dataUrl: string
  label: string
}
