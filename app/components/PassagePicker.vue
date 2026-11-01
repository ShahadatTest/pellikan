<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { BOOKS } from '~~/shared/books'
import type { BookMeta } from '~~/shared/books'

const props = defineProps<{ book: BookMeta | undefined; chapter: number }>()

const open = ref(false)
const picked = ref<BookMeta | null>(null)
const root = ref<HTMLElement | null>(null)
const chapterCounts = useState<Record<number, number>>('chapters', () => ({}))

const groups = [
  { label: 'Old Testament', books: BOOKS.filter((b) => b.testament === 'OT') },
  { label: 'New Testament', books: BOOKS.filter((b) => b.testament === 'NT') },
]

function toggle() { open.value = !open.value; picked.value = null }
function go(b: BookMeta, ch: number) {
  open.value = false
  navigateTo(`/read/${b.osis}/${ch}`)
}
function pickBook(b: BookMeta) {
  // One-chapter books skip the chapter step.
  if ((chapterCounts.value[b.id] ?? 1) === 1) go(b, 1)
  else picked.value = b
}

function onDoc(e: MouseEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button type="button" class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-lg font-semibold hover:bg-surface-2" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      {{ book?.name }} {{ chapter }}<ChevronDown class="size-4 text-muted" aria-hidden="true" />
    </button>
    <div v-if="open" role="dialog" aria-label="Choose a passage" class="absolute left-0 top-11 z-40 max-h-[26rem] w-[22rem] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-2xl">
      <template v-if="!picked">
        <template v-for="g in groups" :key="g.label">
          <h3 class="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-faint">{{ g.label }}</h3>
          <div class="grid grid-cols-2 gap-0.5">
            <button
              v-for="b in g.books" :key="b.id" type="button"
              class="rounded-md px-2 py-1 text-left text-sm hover:bg-surface-2"
              :class="b.id === props.book?.id ? 'bg-accent-soft font-medium' : ''"
              @click="pickBook(b)"
            >{{ b.name }}</button>
          </div>
        </template>
      </template>
      <template v-else>
        <button type="button" class="mb-2 text-sm text-accent hover:underline" @click="picked = null">&larr; All books</button>
        <h3 class="mb-2 text-sm font-semibold">{{ picked.name }}</h3>
        <div class="grid grid-cols-6 gap-1">
          <button
            v-for="n in chapterCounts[picked.id] ?? 0" :key="n" type="button"
            class="rounded-md py-1.5 text-sm hover:bg-surface-2"
            :class="picked.id === props.book?.id && n === chapter ? 'bg-accent-soft font-medium' : ''"
            @click="go(picked!, n)"
          >{{ n }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
