import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { compressAdminImage } from './adminImage'

type ProductForGallery = {
  id: string
  name: string
}

type GalleryImage = {
  id: string
  product_id: string
  image_url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
  created_at: string
}

type Props = {
  product: ProductForGallery
  onChanged: () => Promise<void>
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export default function AdminProductGallery({ product, onChanged }: Props) {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const loadImages = useCallback(async () => {
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/product-images?productId=${encodeURIComponent(product.id)}`,
        { cache: 'no-store' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { images: GalleryImage[] }
      setImages(data.images)
      setState('ready')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar la galería.')
      setState('error')
    }
  }, [product.id])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/admin/product-images?productId=${encodeURIComponent(product.id)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))
        return (await response.json()) as { images: GalleryImage[] }
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setImages(data.images)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(error instanceof Error ? error.message : 'No se pudo cargar la galería.')
        setState('error')
      })

    return () => controller.abort()
  }, [product.id])

  async function refreshAfterMutation(successMessage: string) {
    await loadImages()

    try {
      await onChanged()
      setMessage(successMessage)
    } catch {
      setMessage(`${successMessage} Actualizá el catálogo para refrescar la portada.`)
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    if (images.length >= 6) {
      setMessage('La galería admite hasta 6 imágenes.')
      input.value = ''
      return
    }

    setBusyId('upload')
    setMessage('')

    try {
      const compressed = await compressAdminImage(file, {
        maxOutputBytes: 280_000,
        maxDimension: 1100,
      })

      const response = await fetch('/api/admin/product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageUrl: compressed.dataUrl,
          altText: product.name,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await refreshAfterMutation('Imagen agregada a la galería.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar la imagen.')
    } finally {
      setBusyId(null)
      input.value = ''
    }
  }

  async function setPrimary(image: GalleryImage) {
    if (image.is_primary) return

    setBusyId(image.id)
    setMessage('')

    try {
      const response = await fetch('/api/admin/product-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'primary',
          productId: product.id,
          id: image.id,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await refreshAfterMutation('Portada actualizada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cambiar la portada.')
    } finally {
      setBusyId(null)
    }
  }

  async function moveImage(imageId: string, direction: -1 | 1) {
    const ordered = [...images].sort(
      (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    )
    const currentIndex = ordered.findIndex((image) => image.id === imageId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return

    const next = [...ordered]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(nextIndex, 0, moved)

    setBusyId(imageId)
    setMessage('')

    try {
      const response = await fetch('/api/admin/product-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          productId: product.id,
          orderedIds: next.map((image) => image.id),
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      await refreshAfterMutation('Orden de imágenes actualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reordenar la galería.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeImage(image: GalleryImage) {
    const confirmed = window.confirm(
      image.is_primary
        ? '¿Quitar la portada? Si hay otra imagen, pasará a ser la nueva portada.'
        : '¿Quitar esta imagen de la galería?',
    )
    if (!confirmed) return

    setBusyId(image.id)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/product-images?id=${encodeURIComponent(image.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      await refreshAfterMutation('Imagen quitada de la galería.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar la imagen.')
    } finally {
      setBusyId(null)
    }
  }

  const orderedImages = [...images].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )

  return (
    <section className="admin-gallery">
      <div className="admin-gallery-heading">
        <div>
          <span>Galería</span>
          <strong>Fotos del producto</strong>
        </div>
        <small>{images.length}/6 imágenes · La portada se usa en las tarjetas del catálogo.</small>
      </div>

      {message && <p className="admin-gallery-message">{message}</p>}

      {state === 'loading' && (
        <div className="admin-gallery-empty">Cargando galería…</div>
      )}

      {state !== 'loading' && images.length === 0 && (
        <div className="admin-gallery-empty">Todavía no hay imágenes cargadas.</div>
      )}

      {orderedImages.length > 0 && (
        <div className="admin-gallery-grid">
          {orderedImages.map((image, index) => {
            const busy = busyId === image.id

            return (
              <article className="admin-gallery-card" key={image.id}>
                <div className="admin-gallery-preview">
                  <img src={image.image_url} alt={image.alt_text ?? product.name} />
                  {image.is_primary && <span>Portada</span>}
                </div>

                <div className="admin-gallery-card-actions">
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void moveImage(image.id, -1)}
                    disabled={busyId !== null || index === 0}
                    aria-label={`Mover imagen ${index + 1} hacia arriba`}
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void moveImage(image.id, 1)}
                    disabled={busyId !== null || index === orderedImages.length - 1}
                    aria-label={`Mover imagen ${index + 1} hacia abajo`}
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => void setPrimary(image)}
                    disabled={busyId !== null || image.is_primary}
                  >
                    {image.is_primary ? 'Portada' : 'Usar portada'}
                  </button>

                  <button
                    type="button"
                    className="admin-danger"
                    onClick={() => void removeImage(image)}
                    disabled={busy}
                  >
                    Quitar
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <label className="admin-gallery-upload">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void uploadImage(event)}
          disabled={busyId !== null || images.length >= 6}
        />
        <span>
          {busyId === 'upload'
            ? 'Procesando…'
            : images.length >= 6
              ? 'Límite de 6 imágenes alcanzado'
              : 'Agregar imagen a la galería'}
        </span>
      </label>
    </section>
  )
}
