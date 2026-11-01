<script setup lang="ts">
import { ChevronLeft, ChevronRight, Printer, Maximize2, Minimize2 } from 'lucide-vue-next'
import { BOOKS, BOOK_BY_OSIS } from '~~/shared/books'
import type { Word } from '~/utils/types'

const route = useRoute()
const book = computed(() => BOOK_BY_OSIS[route.params.book as string])
const chapter = computed(() => Number(route.params.chapter))
const targetVerse = computed(() => Number(route.query.v) || null)

const { prefs, highlights, setPrefs } = useUserData()
const lastRead = useState<string>('last-read', () => DEFAULT_PATH)
const translation = useTranslation()
await translation.load()

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
  () => `chapter-${translation.id.value}-${route.params.book}-${route.params.chapter}`,
  async () => {
    if (!valid.value) return null
    const p = { translation: translation.id.value, book: book.value!.id, chapter: chapter.value }
    const [verses, headings, notes, words] = await Promise.all([
      query<Verse>('chapter_verses', p),
      query<Heading>('chapter_headings', p),
      query<Note>('chapter_notes', p),
      query<Word>('chapter_words', { book: p.book, chapter: p.chapter }),
    ])
    return { verses: verses.map((v) => ({ ...v, parsed: JSON.parse(v.tokens) })), headings, notes, words }
  },
  { watch: [() => route.params.book, () => route.params.chapter, translation.id] },
)

const selectedVerse = ref<number | null>(null)
const selectedNote = ref<{ kind: string; text: string } | null>(null)
const pickedWord = ref<Word | null>(null)
const guideTab = ref<'overview' | 'xref' | 'word'>('overview')

watch(() => [route.params.book, route.params.chapter], () => {
  selectedVerse.value = targetVerse.value; selectedNote.value = null; pickedWord.value = null
})

function pickVerse(n: number) { selectedVerse.value = n; selectedNote.value = null; pickedWord.value = null }
function pickNote(verse: number, seq: number) {
  selectedVerse.value = verse
  selectedNote.value = data.value?.notes.find((n) => n.verse === verse && n.seq === seq) ?? null
  guideTab.value = 'overview'
}
function pickWord(w: Word) { pickedWord.value = w; guideTab.value = 'word' }

function printChapter() { window.print() }
function scrollToVerse(v: number) { document.getElementById(`v${v}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }

// Scroll to ?v= once the verses are on screen, and treat it as the selected verse.
watch([data, targetVerse], async () => {
  if (!targetVerse.value) return
  selectedVerse.value = targetVerse.value
  await nextTick()
  document.getElementById(`v${targetVerse.value}`)?.scrollIntoView({ block: 'center' })
}, { flush: 'post', immediate: true })

watch(() => route.fullPath, (p) => { if (valid.value && p.startsWith('/read/')) lastRead.value = p }, { immediate: true })

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

const originalVerse = computed(() => selectedVerse.value ?? data.value?.verses[0]?.verse ?? 1)
const hlColor = (v: number) => highlights.value[verseKey(route.params.book as string, chapter.value, v)]

useHead(() => ({ title: valid.value ? `${book.value!.name} ${chapter.value} · Pellikan` : 'Pellikan' }))
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-4">
    <div class="grid min-h-0 flex-1 gap-4" :class="prefs.focus ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_21rem]'">
      <!-- Reader -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface" aria-label="Reader">
        <div class="flex items-center gap-2 border-b border-line px-3 py-2" data-chrome>
          <select
            v-if="translation.list.value.length > 1"
            :value="translation.id.value"
            class="rounded-md bg-surface-2 px-2 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Translation"
            @change="translation.set(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="t in translation.list.value" :key="t.id" :value="t.id">{{ t.id }}</option>
          </select>
          <span v-else class="rounded-md bg-surface-2 px-2.5 py-1 text-sm font-medium" title="Only one translation is bundled">{{ translation.id.value }}</span>
          <PassagePicker :book="book" :chapter="chapter" />
          <div class="ml-auto flex items-center gap-0.5 text-muted">
            <NuxtLink v-if="prev" :to="`/read/${prev.osis}/${prev.ch}`" class="grid size-9 place-items-center rounded-lg hover:bg-surface-2 hover:text-fg" aria-label="Previous chapter"><ChevronLeft class="size-5" /></NuxtLink>
            <NuxtLink v-if="next" :to="`/read/${next.osis}/${next.ch}`" class="grid size-9 place-items-center rounded-lg hover:bg-surface-2 hover:text-fg" aria-label="Next chapter"><ChevronRight class="size-5" /></NuxtLink>
            <span class="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <button type="button" class="grid size-9 place-items-center rounded-lg text-sm hover:bg-surface-2 hover:text-fg disabled:opacity-30" :disabled="prefs.fontSize <= 16" aria-label="Smaller text" @click="setPrefs({ fontSize: prefs.fontSize - 1 })">A&minus;</button>
            <button type="button" class="grid size-9 place-items-center rounded-lg text-base hover:bg-surface-2 hover:text-fg disabled:opacity-30" :disabled="prefs.fontSize >= 30" aria-label="Larger text" @click="setPrefs({ fontSize: prefs.fontSize + 1 })">A+</button>
            <button type="button" class="grid size-9 place-items-center rounded-lg hover:bg-surface-2 hover:text-fg" aria-label="Print this chapter" @click="printChapter"><Printer class="size-5" /></button>
            <button type="button" class="grid size-9 place-items-center rounded-lg hover:bg-surface-2 hover:text-fg" :aria-label="prefs.focus ? 'Show side panels' : 'Focus on the text'" :aria-pressed="prefs.focus" @click="setPrefs({ focus: !prefs.focus })">
              <Minimize2 v-if="prefs.focus" class="size-5" /><Maximize2 v-else class="size-5" />
            </button>
          </div>
        </div>

        <article class="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div v-if="!valid" class="mx-auto max-w-prose">
            <h1 class="font-reading text-2xl">Passage not found</h1>
            <p class="mt-2 text-muted">
              <template v-if="book">{{ book.name }} has {{ chapterCount }} chapters.</template>
              <template v-else>There is no book called "{{ route.params.book }}".</template>
            </p>
          </div>
          <div v-else class="mx-auto max-w-[44rem]">
            <p v-if="error" class="text-red-500">Could not load this chapter: {{ error.statusMessage || error.message }}</p>
            <p v-else-if="pending && !data" class="text-muted">Loading…</p>

            <div v-else-if="data" class="font-reading" :style="{ fontSize: `${prefs.fontSize}px`, lineHeight: 1.75 }">
              <template v-for="v in data.verses" :key="v.verse">
                <template v-for="(h, hi) in data.headings.filter((x) => x.before_verse === v.verse)" :key="`h${hi}`">
                  <h2 v-if="h.kind === 'ms'" class="mb-2 mt-8 font-sans text-[0.8rem] font-semibold uppercase tracking-wider text-accent">{{ h.text }}</h2>
                  <p v-else-if="h.kind === 'd' && data.words.some((w) => w.verse === 0)" class="mb-1 mt-4 text-center text-[0.9em] italic text-muted">
                    <button type="button" class="italic underline decoration-dotted underline-offset-4 hover:text-accent" title="Show the Hebrew title" @click="pickVerse(0)">{{ h.text }}</button>
                  </p>
                  <p v-else class="mb-1 mt-4 text-center text-[0.9em] italic text-muted">{{ h.text }}</p>
                </template>
                <span
                  :id="`v${v.verse}`"
                  class="cursor-pointer rounded-sm box-decoration-clone"
                  :class="[v.para ? 'mt-4 block' : '', v.poetry ? 'block pl-4' : 'inline', selectedVerse === v.verse ? 'bg-sel' : '']"
                  :style="selectedVerse !== v.verse && hlColor(v.verse) ? { background: `var(--hl-${hlColor(v.verse)})` } : undefined"
                  @click="pickVerse(v.verse)"
                >
                  <button
                    type="button"
                    class="mr-1 align-super font-sans text-[0.6em] font-semibold text-faint hover:text-accent"
                    :class="selectedVerse === v.verse ? 'text-accent' : ''"
                    :aria-label="`Verse ${v.verse}`"
                    :aria-pressed="selectedVerse === v.verse"
                    @click.stop="pickVerse(v.verse)"
                  >{{ v.verse }}</button>
                  <VerseText :tokens="v.parsed" :red-letters="prefs.redLetters" @note="(seq) => pickNote(v.verse, seq)" />{{ ' ' }}
                </span>
              </template>
              <p class="mt-10 font-sans text-xs text-faint">{{ translation.info.value?.attribution }} See Credits for the original-language data sources.</p>
            </div>
          </div>
        </article>
      </section>

      <!-- Right rail -->
      <div v-if="!prefs.focus && valid && data" class="flex min-h-0 flex-col gap-4" data-chrome>
        <StudyGuide
          v-model:tab="guideTab"
          :book-name="book!.name" :chapter="chapter" :verse-count="data.verses.length"
          :headings="data.headings" :notes="data.notes" :footnote="selectedNote" :word="pickedWord"
          @goto="scrollToVerse"
        />
        <NotesPanel :osis="book!.osis" :book-name="book!.name" :chapter="chapter" :verse="selectedVerse" />
      </div>
    </div>

    <!-- Bottom row -->
    <div v-if="!prefs.focus && valid && data" class="grid h-52 shrink-0 grid-cols-3 gap-4" data-chrome>
      <OriginalPanel :words="data.words" :verse="originalVerse" :label="`${book!.name} ${chapter}:${originalVerse}`" :testament="book!.testament" :picked="pickedWord" @pick="pickWord" />
      <CommentaryPanel />
      <LibraryPanel />
    </div>
  </div>
</template>
