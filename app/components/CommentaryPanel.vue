<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next'

// Matthew Henry's commentary for the chapter on screen. A comment usually covers a run of verses, so the one that
// contains the selected verse is shown; the rest are listed above it as a table of contents.
interface Comment { verse_start: number; verse_end: number; body: string }

const props = defineProps<{ bookId: number; bookName: string; chapter: number; verse: number | null }>()
const SOURCE = 'MHC'

const comments = ref<Comment[]>([])
const failed = ref('')
const picked = ref<number | null>(null) // verse_start of a comment chosen by hand

watch(() => [props.bookId, props.chapter], async () => {
  comments.value = []; picked.value = null; failed.value = ''
  try {
    comments.value = await query<Comment>('commentary_chapter', { source: SOURCE, book: props.bookId, chapter: props.chapter })
  } catch (err: any) {
    failed.value = err?.statusMessage || err?.message || String(err)
  }
}, { immediate: true })
watch(() => props.verse, () => { picked.value = null })

const sections = computed(() => comments.value.filter((c) => c.verse_start > 0))
const intro = computed(() => comments.value.find((c) => c.verse_start === 0) ?? null)
const active = computed<Comment | null>(() => {
  if (picked.value !== null) return comments.value.find((c) => c.verse_start === picked.value) ?? null
  if (props.verse) return sections.value.find((c) => c.verse_start <= props.verse! && props.verse! <= c.verse_end) ?? null
  return intro.value ?? sections.value[0] ?? null
})
const title = (c: Comment) => (c.verse_start === 0 ? 'Chapter overview' : c.verse_start === c.verse_end ? `Verse ${c.verse_start}` : `Verses ${c.verse_start}–${c.verse_end}`)
const paragraphs = (c: Comment) => c.body.split('\n')
</script>

<template>
  <Panel title="Commentary" :icon="MessageSquareText">
    <p v-if="failed" class="text-sm text-red-500">Could not load the commentary: {{ failed }}</p>
    <p v-else-if="!comments.length" class="text-sm text-muted">No commentary on {{ bookName }} {{ chapter }}.</p>
    <template v-else>
      <p class="text-xs text-faint">Matthew Henry, {{ bookName }} {{ chapter }}</p>
      <div class="mt-1 flex flex-wrap gap-1" role="tablist" aria-label="Commentary sections">
        <button
          v-for="c in comments" :key="c.verse_start" type="button" role="tab" :aria-selected="active?.verse_start === c.verse_start"
          class="rounded-md px-2 py-0.5 text-xs"
          :class="active?.verse_start === c.verse_start ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="picked = c.verse_start"
        >{{ c.verse_start === 0 ? 'Overview' : c.verse_start === c.verse_end ? c.verse_start : `${c.verse_start}–${c.verse_end}` }}</button>
      </div>
      <div v-if="active" class="mt-3 space-y-2 text-sm leading-relaxed">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-brand">{{ title(active) }}</h3>
        <p v-for="(p, i) in paragraphs(active)" :key="i">{{ p }}</p>
      </div>
      <p v-else class="mt-3 text-sm text-muted">Select a verse to read what Matthew Henry says about it.</p>
    </template>
  </Panel>
</template>
