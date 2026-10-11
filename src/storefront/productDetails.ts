export function productLeadTimeLabel(days: number | null) {
  if (!days || days <= 0) return 'A coordinar'
  return days === 1 ? '1 día' : `${days} días`
}

export function productGalleryLabel(count: number) {
  if (count <= 0) return 'Sin fotos'
  return count === 1 ? '1 foto' : `${count} fotos`
}
