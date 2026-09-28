export async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

export function adminRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init)
}
