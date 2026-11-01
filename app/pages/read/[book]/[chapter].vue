<script setup lang="ts">
import { BOOKS, BOOK_BY_OSIS } from '~~/shared/books'

const route = useRoute()
const book = computed(() => BOOK_BY_OSIS[route.params.book as string])
const chapter = computed(() => Number(route.params.chapter))
const targetVerse = computed(() => Number(route.query.v) || null)

const chapterCounts = useState<Record<number, number>>('chapters', () => ({}))
if (!Object.keys(chapterCounts.value).length) {
  const rows = await query<{ id: number; chapters: number }>('books')
  chapterCounts.value = Object.fromEntries(rows.map((r) => [r.id, r.chapters]))
}
const chapterCount = computed(() => (book.value ? chapterCounts.value[book.value.id] ?? 0 : 0))
const valid = computed(() => !!book.value && Number.isInteger(chapter.value) && chapter.value >= 1 && chapter.value <= chapterCount.value)

interface Verse { verse: number; text: string; tokens: string; para: number; poetry: number }
interface Heading { before_verse: number; kind: string; text: string }
interface Note { verse: number; seq: number; kind: string; text: string }

const { data, pending, error } = await useAsyncData(
  () => `chapter-${route.params.book}-${route.params.chapter}`,
  async () => {
    if (!valid.value) return null
    const p = { translation: TRANSLATION, book: book.value!.id, chapter: chapter.value }
    const [verses, headings, notes, words] = await Promise.all([
      query<Verse>('chapter_verses', p),
      query<Heading>('chapter_headings', p),
      query<Note>('chapter_notes', p),
      query('chapter_words', { book: p.book, chapter: p.chapter }),
    ])
    return { verses: verses.map((v) => ({ ...v, parsed: JSON.parse(v.tokens) })), headings, notes, words }
  },
  { watch: [() => route.params.book, () => route.params.chapter] },
)

const selectedVerse = ref<number | null>(null)
const selectedNote = ref<{ kind: string; text: string } | null>(null)

watch(() => route.fullPath, () => { selectedVerse.value = null; selectedNote.value = null })

function pickVerse(n: number) { selectedVerse.value = n; selectedNote.value = null }
function pickNote(verse: number, seq: number) {
  selectedNote.value = data.value?.notes.find((n) => n.verse === verse && n.seq === seq) ?? null
}

// Scroll to ?v= once the verses are on screen.
watch([data, targetVerse], async () => {
  if (!targetVerse.value) return
  await nextTick()
  document.getElementById(`v${targetVerse.value}`)?.scrollIntoView({ block: 'center' })
}, { flush: 'post' })

const prev = computed(() => {
  if (!book.value) return null
  if (chapter.value > 1) return { osis: book.value.osis, ch: chapter.value - 1 }
  const b = BOOKS[book.value.id - 2]
  return b ? { osis: b.osis, ch: chapterCounts.value[b.id] } : null
})
const next = computed(() => {
  if (!book.value) return null
  if (chapter.value < chapterCount.value) return { osis: book.value.osis, ch: chapter.value + 1 }
  const b = BOOKS[book.value.id]
  return b ? { osis: b.osis, ch: 1 } : null
})

useHead(() => ({ title: valid.value ? `${book.value!.name} ${chapter.value} · Scriptorium` : 'Scriptorium' }))
</script>

<template>
  <div class="grid h-full grid-cols-[13rem_minmax(0,1fr)_22rem]">
    <nav class="overflow-y-auto border-r border-black/10 py-3 text-sm dark:border-white/10" aria-label="Books">
      <template v-for="(group, gi) in [BOOKS.filter((b) => b.testament === 'OT'), BOOKS.filter((b) => b.testament === 'NT')]" :key="gi">
        <h2 class="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">{{ gi ? 'New Testament' : 'Old Testament' }}</h2>
        <NuxtLink
          v-for="b in group"
          :key="b.id"
          :to="`/read/${b.osis}/1`"
          class="block px-4 py-1 hover:bg-accent/10"
          :class="b.id === book?.id ? 'bg-accent/15 font-medium' : ''"
        >{{ b.name }}</NuxtLink>
      </template>
    </nav>

    <article class="overflow-y-auto px-8 py-6">
      <div v-if="!valid" class="mx-auto max-w-prose">
        <h1 class="font-reading text-2xl">Passage not found</h1>
        <p class="mt-2">
          <template v-if="book">{{ book.name }} has {{ chapterCount }} chapters.</template>
          <template v-else>There is no book called "{{ route.params.book }}".</template>
        </p>
      </div>
      <div v-else class="mx-auto max-w-prose">
        <div class="mb-6 flex items-baseline justify-between">
          <h1 class="font-reading text-3xl font-semibold">{{ book!.name }} {{ chapter }}</h1>
          <span class="flex gap-3 text-sm">
            <NuxtLink v-if="prev" :to="`/read/${prev.osis}/${prev.ch}`" aria-label="Previous chapter" class="hover:underline">&larr; Prev</NuxtLink>
            <NuxtLink v-if="next" :to="`/read/${next.osis}/${next.ch}`" aria-label="Next chapter" class="hover:underline">Next &rarr;</NuxtLink>
          </span>
        </div>

        <p v-if="error" class="text-red-700 dark:text-red-400">Could not load this chapter: {{ error.statusMessage || error.message }}</p>
        <p v-else-if="pending && !data" class="text-black/55 dark:text-white/55">Loading…</p>

        <div v-else-if="data" class="font-reading text-lg leading-8">
          <template v-for="v in data.verses" :key="v.verse">
            <template v-for="(h, hi) in data.headings.filter((x) => x.before_verse === v.verse)" :key="`h${hi}`">
              <h2 v-if="h.kind === 'ms'" class="mb-2 mt-8 font-sans text-sm font-semibold uppercase tracking-wide text-accent dark:text-amber-300">{{ h.text }}</h2>
              <p v-else-if="h.kind === 'd' && data.words.some((w: any) => w.verse === 0)" class="mb-1 mt-4 text-center text-base italic text-black/65 dark:text-white/65">
                <button type="button" class="italic underline decoration-dotted underline-offset-4 hover:text-accent" title="Show the Hebrew title" @click="pickVerse(0)">{{ h.text }}</button>
              </p>
              <p v-else class="mb-1 mt-4 text-center text-base italic text-black/65 dark:text-white/65">{{ h.text }}</p>
            </template>
            <span :id="`v${v.verse}`" :class="[v.para ? 'mt-4 block' : '', v.poetry ? 'block pl-4' : 'inline', targetVerse === v.verse ? 'rounded bg-amber-200/50 dark:bg-amber-300/20' : '']">
              <button
                type="button"
                class="mr-1 align-super font-sans text-[0.65rem] font-semibold text-accent hover:underline dark:text-amber-300"
                :class="selectedVerse === v.verse ? 'underline' : ''"
                :aria-label="`Verse ${v.verse}, show original text`"
                @click="pickVerse(v.verse)"
              >{{ v.verse }}</button>
              <VerseText
                :tokens="v.parsed"
                @note="(seq) => pickNote(v.verse, seq)"
              />{{ ' ' }}
            </span>
          </template>
          <p class="mt-10 font-sans text-xs text-black/50 dark:text-white/50">World English Bible (public domain). See Credits for the original-language data sources.</p>
        </div>
      </div>
    </article>

    <StudyPanel
      :verse="selectedVerse"
      :words="(data?.words as any) ?? []"
      :note="selectedNote"
    />
  </div>
</template>
