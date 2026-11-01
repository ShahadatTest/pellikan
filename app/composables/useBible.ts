import { BOOKS, BOOK_BY_OSIS } from '~~/shared/books'

/** The translation every build contains. Others (the ESV, when the epub was supplied) are optional. */
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

export interface TranslationInfo { id: string; name: string; kind: string; attribution: string }

/** The reader's current translation, chosen from whatever this bible.db contains. Falls back to the WEB. */
export function useTranslation() {
  const { prefs, setPrefs } = useUserData()
  const list = useState<TranslationInfo[]>('translations', () => [])
  const id = computed(() => (list.value.some((t) => t.id === prefs.value.translation) ? prefs.value.translation : TRANSLATION))
  const info = computed(() => list.value.find((t) => t.id === id.value) ?? null)
  async function load() {
    if (list.value.length) return
    const rows = await query<TranslationInfo>('sources')
    list.value = rows.filter((r) => r.kind === 'translation')
  }
  return { id, info, list, load, set: (next: string) => setPrefs({ translation: next }) }
}
