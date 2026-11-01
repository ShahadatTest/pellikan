<script setup lang="ts">
import { BOOK_BY_ID } from '~~/shared/books'
import { decodeGreekMorph, decodeHebrewMorph } from '~~/shared/morph'

interface Word {
  id: number; verse: number; position: number; lang: 'heb' | 'arc' | 'grc'; text: string; trail: string | null
  lemma: string | null; lemma_key: string; strongs: string | null; pos: string | null; morph: string; variant: string | null
}
interface Occurrence { book_id: number; chapter: number; verse: number; form: string; verse_text: string | null }

const props = defineProps<{
  verse: number | null // 0 = unnumbered psalm title
  words: Word[]
  note: { kind: string; text: string } | null
}>()

const verseWords = computed(() => props.words.filter((w) => w.verse === props.verse && w.variant !== 'qere'))
const rtl = computed(() => !!verseWords.value[0] && verseWords.value[0].lang !== 'grc')

function describe(w: Word): string {
  try {
    return w.lang === 'grc' ? decodeGreekMorph(w.pos ?? '', w.morph).summary : decodeHebrewMorph(w.morph).summary
  } catch {
    return w.morph // never hide a code the decoder doesn't understand
  }
}

// Lower half: every use of the lexeme the reader picked.
const picked = ref<{ key: string; label: string } | null>(null)
const results = ref<Occurrence[]>([])
const total = ref<number | null>(null)
const loading = ref(false)
const failed = ref('')
const LIMIT = 40

watch(() => props.verse, () => { picked.value = null; results.value = []; total.value = null; failed.value = '' })

async function pickWord(w: Word) {
  picked.value = { key: w.lemma_key, label: w.lemma ?? w.strongs ?? w.text }
  loading.value = true
  failed.value = ''
  results.value = []
  total.value = null
  try {
    results.value = await query<Occurrence>('occurrences_by_key', { translation: TRANSLATION, key: w.lemma_key, limit: LIMIT, offset: 0 })
    total.value = (await query<{ occurrences: number }>('lemma_info', { key: w.lemma_key }))[0]?.occurrences ?? null
  } catch (err: any) {
    failed.value = err?.statusMessage || err?.message || String(err)
  } finally {
    loading.value = false
  }
}

const refLabel = (o: Occurrence) => `${BOOK_BY_ID[o.book_id]?.name} ${o.chapter}:${o.verse}`
</script>

<template>
  <aside class="h-full overflow-y-auto border-l border-black/10 p-4 text-sm dark:border-white/10" aria-label="Study panel">
    <p v-if="verse === null && !note" class="text-black/55 dark:text-white/55">
      Click a verse number to see its Hebrew or Greek words with grammar, then click a word to see everywhere it is used.
    </p>

    <section v-if="note" class="mb-5">
      <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-accent dark:text-amber-300">
        {{ note.kind === 'xref' ? 'Cross-reference' : 'Footnote' }}
      </h2>
      <p>{{ note.text }}</p>
    </section>

    <section v-if="verse !== null && verseWords.length" class="mb-5">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-accent dark:text-amber-300">
        {{ verse === 0 ? 'Original text, psalm title' : `Original text, verse ${verse}` }}
      </h2>
      <ul class="space-y-1" :dir="rtl ? 'rtl' : 'ltr'">
        <li v-for="w in verseWords" :key="w.id">
          <button
            type="button"
            class="w-full rounded px-2 py-1 text-start hover:bg-accent/10"
            :class="picked?.key === w.lemma_key ? 'bg-accent/15' : ''"
            @click="pickWord(w)"
          >
            <span :class="w.lang === 'grc' ? 'font-greek text-lg' : 'font-hebrew text-xl'">{{ w.text }}</span>
            <span class="block text-xs text-black/60 dark:text-white/60" dir="ltr">
              <template v-if="w.lemma">{{ w.lemma }} · </template><template v-if="w.strongs">{{ w.strongs }} · </template>{{ describe(w) }}<template v-if="w.variant"> · {{ w.variant }}</template>
            </span>
          </button>
        </li>
      </ul>
    </section>
    <p v-else-if="verse !== null" class="mb-5 text-black/60 dark:text-white/60">
      No original-language words for this verse in the bundled texts (it is absent from the SBLGNT or the WLC).
    </p>

    <section v-if="picked">
      <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-accent dark:text-amber-300">
        {{ picked.label }}
        <span v-if="total !== null" class="font-normal normal-case text-black/60 dark:text-white/60">· {{ total }} uses</span>
      </h2>
      <p v-if="failed" class="text-red-700 dark:text-red-400">Lookup failed: {{ failed }}</p>
      <p v-else-if="loading" class="text-black/55 dark:text-white/55">Loading…</p>
      <ul v-else class="space-y-2">
        <li v-for="(o, i) in results" :key="i">
          <NuxtLink :to="{ path: `/read/${BOOK_BY_ID[o.book_id]?.osis}/${o.chapter}`, query: { v: o.verse } }" class="font-medium text-accent hover:underline dark:text-amber-300">
            {{ refLabel(o) }}
          </NuxtLink>
          <span class="block text-black/70 dark:text-white/70">{{ o.verse_text }}</span>
        </li>
      </ul>
      <p v-if="results.length === LIMIT" class="mt-2 text-xs text-black/55 dark:text-white/55">Showing the first {{ LIMIT }}.</p>
    </section>
  </aside>
</template>
