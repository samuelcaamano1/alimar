import { issueSignedToken, presignUrl } from '@vercel/blob'

const PRIVATE_BLOB_SUFFIX = '.private.blob.vercel-storage.com'
const READ_URL_MS = 30 * 60 * 1000

function privateBlobPath(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.endsWith(PRIVATE_BLOB_SUFFIX)) {
      return null
    }

    return url.pathname.replace(/^\/+/, '') || null
  } catch {
    return null
  }
}

export function isPrivateOrderBlobUrl(value: string) {
  return Boolean(privateBlobPath(value))
}

export async function resolveOrderFileUrl(value: string) {
  const pathname = privateBlobPath(value)
  if (!pathname) return value

  try {
    const validUntil = Date.now() + READ_URL_MS
    const token = await issueSignedToken({
      pathname,
      operations: ['get'],
      validUntil,
    })
    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'get',
      access: 'private',
      validUntil,
    })

    return presignedUrl
  } catch {
    // Keep the private canonical URL as a safe fallback. It cannot expose bytes
    // without a valid signed URL or Blob credential.
    return value
  }
}

export async function resolveOrderFileUrls<T extends { url: string }>(files: T[]) {
  if (!files.some((file) => isPrivateOrderBlobUrl(file.url))) return files

  return Promise.all(
    files.map(async (file) => ({
      ...file,
      url: await resolveOrderFileUrl(file.url),
    })),
  )
}
