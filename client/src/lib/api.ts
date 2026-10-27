/**
 * fetch 래퍼.
 * - access token 은 메모리(pinia)에만 보관, 요청 시 Authorization 헤더로 전송
 * - 401 이면 refresh cookie 로 1회 재발급 후 재시도, 실패하면 로그아웃 처리
 */
import { useAuthStore } from '../stores/auth'

export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail?: string) {
    super(detail ? `${status} ${code} · ${detail}` : `${status} ${code}`)
  }
}

async function request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })

  if (res.status === 401 && retry && !url.startsWith('/api/auth/')) {
    const ok = await auth.refresh()
    if (ok) return request<T>(method, url, body, false)
    // 탈락 통보를 받았으면 탈락 화면이 끝날 때 로그아웃한다
    if (!auth.eliminated) auth.clear()
  }
  if (!res.ok) {
    let code = 'error'
    let detail: string | undefined
    try {
      const body = (await res.json()) as { error?: string; detail?: string }
      code = body.error ?? code
      detail = body.detail
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body ?? {}),
}
