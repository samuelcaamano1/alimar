const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

type CompressOptions = {
  maxDimension?: number
  maxDataUrlLength?: number
}

function imageFromObjectUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No pudimos abrir la imagen.'))
    image.src = url
  })
}

function scaledSize(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height }
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height)

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
) {
  const maxDimension = options.maxDimension ?? 1400
  const maxDataUrlLength = options.maxDataUrlLength ?? 900_000

  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLocaleLowerCase())) {
    throw new Error('Usá una imagen JPG, PNG o WebP.')
  }

  if (file.size > 8_000_000) {
    throw new Error('La imagen original no puede superar 8 MB.')
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await imageFromObjectUrl(objectUrl)
    const initial = scaledSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxDimension,
    )

    let width = initial.width
    let height = initial.height

    for (let dimensionPass = 0; dimensionPass < 4; dimensionPass += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('No pudimos preparar la imagen.')
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)

      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        const webp = canvas.toDataURL('image/webp', quality)

        if (
          webp.startsWith('data:image/webp') &&
          webp.length <= maxDataUrlLength
        ) {
          return webp
        }

        const jpeg = canvas.toDataURL('image/jpeg', quality)

        if (jpeg.length <= maxDataUrlLength) {
          return jpeg
        }
      }

      width = Math.max(320, Math.round(width * 0.78))
      height = Math.max(320, Math.round(height * 0.78))
    }

    throw new Error(
      'La imagen sigue siendo demasiado pesada. Probá con una foto más chica.',
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
