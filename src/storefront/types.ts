export type CatalogVariant = {
  id: string
  name: string
  priceOverride: string | null
}

export type CatalogImage = {
  id: string
  url: string
  alt_text: string | null
  is_primary: boolean
}

export type CatalogCustomizationField = {
  id: string
  label: string
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select'
  placeholder: string | null
  options: string[]
  required: boolean
  maxLength: number
}

export type CartCustomizationValue = {
  fieldId: string
  label: string
  value: string
}

export type CatalogProduct = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  kind: 'service' | 'product'
  pricingMode: 'fixed' | 'from' | 'quote'
  basePrice: string | null
  imageUrl: string | null
  customizationAllowed: boolean
  featured: boolean
  customizationFields: CatalogCustomizationField[]
  variants: CatalogVariant[]
}

export type CartItem = CatalogProduct & {
  variantId: string | null
  variantName: string | null
  unitPrice: string | null
  quantity: number
  note: string
  customizations: CartCustomizationValue[]
}

export type CatalogCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  products: CatalogProduct[]
}

export type CatalogResponse = {
  categories: CatalogCategory[]
}

export type CustomRequestSuccess = {
  requestCode: string
  whatsappMessage: string
}

export type CustomRequestType =
  | 'paper'
  | '3d'
  | 'event'
  | 'design'
  | 'other'

export type CustomRequestExampleKey = string

export type CustomRequestExample = {
  id?: string
  key: CustomRequestExampleKey
  title: string
  hint: string
  requestType: CustomRequestType
  art: string
  imageUrl?: string | null
  imageAlt?: string | null
  sizePlaceholder: string
  themePlaceholder: string
  descriptionPlaceholder: string
}
