const MAX_SOURCE_BYTES = 12 * 1024 * 1024
const MAX_OUTPUT_BYTES = 1_050_000
const MAX_DIMENSION = 1400

type CompressAdminImageOptions = {
  maxOutputBytes?: number
  maxDimension?: number
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer la imagen.'))
        return
      }

      resolve(reader.result)
    }

    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('El archivo no es una imagen válida.'))
    }

    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo comprimir la imagen.'))
          return
        }

        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}

export async function compressAdminImage(
  file: File,
  options: CompressAdminImageOptions = {},
) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Elegí un archivo de imagen.')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('La imagen original no puede superar 12 MB.')
  }

  const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES
  const maxDimension = options.maxDimension ?? MAX_DIMENSION

  const image = await loadImage(file)
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Tu navegador no pudo procesar la imagen.')

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let blob: Blob | null = null

  for (const quality of [0.84, 0.76, 0.68, 0.58, 0.5, 0.44]) {
    blob = await canvasToBlob(canvas, quality)
    if (blob.size <= maxOutputBytes) break
  }

  if (!blob || blob.size > maxOutputBytes) {
    throw new Error('La imagen sigue siendo demasiado pesada. Probá con una foto más chica.')
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    outputBytes: blob.size,
    width: canvas.width,
    height: canvas.height,
  }
}
