<script setup lang="ts">
import { BOOK_BY_ID } from '~~/shared/books'

import type { Word } from '~/utils/types'

interface Occurrence { book_id: number; chapter: number; verse: number; form: string; verse_text: string | null }

const props = defineProps<{ word: Word | null }>()
const translation = useTranslation()

interface LexEntry {
  id: number; source_id: string; source_name: string; entry_id: string; lang: string; headword: string
  translit: string | null; pron: string | null; pos: string | null; gloss: string | null; body: string
  derivation: string | null; usage: string | null
}
const lexicon = ref<LexEntry[]>([])
const expanded = ref<Record<number, boolean>>({})
const SHORT = { STRONGS_H: "Strong's", STRONGS_G: "Strong's", BDB: 'Brown-Driver-Briggs', THAYER: "Thayer's" } as Record<string, string>
const PREVIEW = 700
const shown = (e: LexEntry) => (expanded.value[e.id] || e.body.length <= PREVIEW ? e.body : e.body.slice(0, PREVIEW).replace(/\s+\S*$/, '') + '…')

// Entries come from the Strong's number, so a Hebrew word and its Greek Septuagint counterpart each get their own.
watch(() => props.word?.strongs, async (strongs) => {
  lexicon.value = []; expanded.value = {}
  if (!strongs) return
  try {
    const rows = await query<LexEntry>('lexicon_for_strongs', { strongs })
    if (props.word?.strongs === strongs) lexicon.value = rows
  } catch { /* the word-use list below still works without a lexicon */ }
}, { immediate: true })

const results = ref<Occurrence[]>([])
const total = ref<number | null>(null)
const loading = ref(false)
const failed = ref('')
const LIMIT = 40

watch(() => props.word?.lemma_key, async (key) => {
  results.value = []; total.value = null; failed.value = ''
  if (!key) return
  loading.value = true
  try {
    const rows = await query<Occurrence>('occurrences_by_key', { translation: translation.lookupId.value, key, limit: LIMIT, offset: 0 })
    if (props.word?.lemma_key !== key) return // reader picked another word meanwhile
    results.value = rows
    total.value = (await query<{ occurrences: number }>('lemma_info', { key }))[0]?.occurrences ?? null
  } catch (err: any) {
    failed.value = err?.statusMessage || err?.message || String(err)
  } finally {
    loading.value = false
  }
}, { immediate: true })

const refLabel = (o: Occurrence) => `${BOOK_BY_ID[o.book_id]?.name} ${o.chapter}:${o.verse}`
</script>

<template>
  <p v-if="!word" class="text-sm text-muted">Pick a Hebrew or Greek word in the Original Language panel to see every place it is used.</p>
  <div v-else>
    <p class="text-sm font-semibold text-accent">
      {{ word.lemma ?? word.strongs ?? word.text }}
      <span v-if="total !== null" class="font-normal text-muted">· {{ total.toLocaleString() }} uses</span>
    </p>
    <section v-for="e in lexicon" :key="e.id" class="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <h3 class="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wider text-brand">
        {{ SHORT[e.source_id] ?? e.source_name }}
        <span class="font-normal normal-case tracking-normal text-faint">{{ e.entry_id.startsWith('G') || e.entry_id.startsWith('H') ? e.entry_id : '' }}</span>
      </h3>
      <p class="mt-1">
        <span class="font-reading text-lg" :dir="e.lang === 'grc' ? 'ltr' : 'rtl'" :lang="e.lang === 'grc' ? 'grc' : 'he'">{{ e.headword }}</span>
        <span v-if="e.translit" class="ml-2 italic text-muted">{{ e.translit }}</span>
        <span v-if="e.pron" class="ml-2 text-faint">({{ e.pron }})</span>
      </p>
      <p v-if="e.derivation" class="mt-1 text-muted">{{ e.derivation }}</p>
      <p class="mt-1 whitespace-pre-line">{{ shown(e) }}</p>
      <p v-if="e.usage" class="mt-1 text-muted"><span class="text-faint">KJV: </span>{{ e.usage }}</p>
      <button v-if="e.body.length > PREVIEW" type="button" class="mt-1 text-xs text-accent hover:underline" :aria-expanded="!!expanded[e.id]" @click="expanded[e.id] = !expanded[e.id]">
        {{ expanded[e.id] ? 'Show less' : 'Show the full entry' }}
      </button>
    </section>
    <p v-if="failed" class="mt-2 text-sm text-red-500">Lookup failed: {{ failed }}</p>
    <p v-else-if="loading" class="mt-2 text-sm text-muted">Loading…</p>
    <ul v-else class="mt-2 space-y-3 text-sm">
      <li v-for="(o, i) in results" :key="i">
        <NuxtLink :to="{ path: `/read/${BOOK_BY_ID[o.book_id]?.osis}/${o.chapter}`, query: { v: o.verse } }" class="font-medium text-accent hover:underline">{{ refLabel(o) }}</NuxtLink>
        <span class="mt-0.5 block text-muted">{{ o.verse_text }}</span>
      </li>
    </ul>
    <p v-if="results.length === LIMIT" class="mt-2 text-xs text-faint">Showing the first {{ LIMIT }}.</p>
  </div>
</template>
