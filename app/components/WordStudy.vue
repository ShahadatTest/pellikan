<script setup lang="ts">
import { BOOK_BY_ID } from '~~/shared/books'

import type { Word } from '~/utils/types'

interface Occurrence { book_id: number; chapter: number; verse: number; form: string; verse_text: string | null }

const props = defineProps<{ word: Word | null }>()
const translation = useTranslation()

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
    const rows = await query<Occurrence>('occurrences_by_key', { translation: translation.id.value, key, limit: LIMIT, offset: 0 })
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
