<script setup lang="ts">
import { BOOK_BY_ID } from '~~/shared/books'

// Cross-references for one verse from two sources: the Treasury of Scripture Knowledge (grouped by the phrase it
// supports) and OpenBible.info (ranked by community votes).
interface Ref { to_book_id: number; to_chapter: number; to_verse: number; to_verse_end: number; weight: number; note: string | null; text: string | null }

const props = defineProps<{ bookId: number; chapter: number; verse: number | null }>()
const translation = useTranslation()

const tsk = ref<Ref[]>([])
const openbible = ref<Ref[]>([])
const failed = ref('')

watch(() => [props.bookId, props.chapter, props.verse, translation.lookupId.value] as const, async ([book, chapter, verse, tr]) => {
  tsk.value = []; openbible.value = []; failed.value = ''
  if (!verse) return
  try {
    const p = { translation: tr, book, chapter, verse }
    const [a, b] = await Promise.all([
      query<Ref>('cross_refs', { ...p, source: 'OPENBIBLE', limit: 30 }),
      query<Ref>('cross_refs', { ...p, source: 'TSK', limit: 300 }),
    ])
    if (props.verse === verse) { openbible.value = a; tsk.value = b }
  } catch (err: any) {
    failed.value = err?.statusMessage || err?.message || String(err)
  }
}, { immediate: true })

const label = (r: Ref) => {
  const b = BOOK_BY_ID[r.to_book_id]?.name ?? '?'
  return r.to_verse_end > r.to_verse ? `${b} ${r.to_chapter}:${r.to_verse}–${r.to_verse_end}` : `${b} ${r.to_chapter}:${r.to_verse}`
}
const to = (r: Ref) => ({ path: `/read/${BOOK_BY_ID[r.to_book_id]?.osis}/${r.to_chapter}`, query: { v: r.to_verse } })

const tskGroups = computed(() => {
  const groups: { phrase: string | null; refs: Ref[] }[] = []
  for (const r of tsk.value) {
    const last = groups.at(-1)
    if (last && last.phrase === r.note) last.refs.push(r)
    else groups.push({ phrase: r.note, refs: [r] })
  }
  return groups
})
</script>

<template>
  <div class="text-sm">
    <p v-if="!verse" class="text-muted">Select a verse to see where else the Bible speaks to it.</p>
    <p v-else-if="failed" class="text-red-500">Could not load cross-references: {{ failed }}</p>
    <template v-else>
      <section v-if="openbible.length">
        <h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Most referenced (OpenBible.info)</h3>
        <ul class="space-y-2">
          <li v-for="(r, i) in openbible" :key="i">
            <NuxtLink :to="to(r)" class="font-medium text-accent hover:underline">{{ label(r) }}</NuxtLink>
            <span v-if="r.text" class="mt-0.5 block text-muted">{{ r.text }}</span>
          </li>
        </ul>
      </section>
      <section v-if="tskGroups.length" :class="openbible.length ? 'mt-5' : ''">
        <h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Treasury of Scripture Knowledge</h3>
        <ul class="space-y-2">
          <li v-for="(g, i) in tskGroups" :key="i">
            <span v-if="g.phrase" class="font-medium">{{ g.phrase }}</span>
            <span class="block text-muted">
              <template v-for="(r, j) in g.refs" :key="j"><NuxtLink :to="to(r)" class="text-accent hover:underline" :title="r.text ?? undefined">{{ label(r) }}</NuxtLink><span v-if="j < g.refs.length - 1">; </span></template>
            </span>
          </li>
        </ul>
      </section>
      <p v-if="!openbible.length && !tskGroups.length" class="text-muted">No cross-references recorded for this verse.</p>
    </template>
  </div>
</template>
