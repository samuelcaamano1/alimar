export type RequestIdentity = {
  id: string
  signature: string
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForSignature)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalizeForSignature(record[key])]),
    )
  }

  return value
}

export function requestPayloadSignature(payload: unknown) {
  return JSON.stringify(normalizeForSignature(payload))
}

export function requestIdentityForPayload(
  current: RequestIdentity | null,
  payload: unknown,
  createId: () => string = () => crypto.randomUUID(),
): RequestIdentity {
  const signature = requestPayloadSignature(payload)

  if (current?.signature === signature) {
    return current
  }

  return {
    id: createId(),
    signature,
  }
}
