import { BOOKS, BOOK_BY_OSIS } from '~~/shared/books'

export const TRANSLATION = 'WEB'

type Params = Record<string, string | number | null>

let invokeFn: ((cmd: string, args: Record<string, unknown>) => Promise<unknown>) | null = null

async function inTauri() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return false
  if (!invokeFn) invokeFn = (await import('@tauri-apps/api/core')).invoke
  return true
}

/**
 * Runs a named query from data/queries/. Inside the desktop app it goes to Rust; in `nuxt dev` in a plain
 * browser it goes to the Nitro dev route. Same SQL either way.
 */
export async function query<T = Record<string, unknown>>(name: string, params: Params = {}): Promise<T[]> {
  if (await inTauri()) return (await invokeFn!('query', { name, params })) as T[]
  return await $fetch<T[]>(`/api/query/${name}`, { method: 'POST', body: params })
}

export function useBooks() {
  return { BOOKS, BOOK_BY_OSIS }
}
