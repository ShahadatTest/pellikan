<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { BOOK_BY_ID } from '~~/shared/books'
import { toFtsQuery } from '~~/shared/text'

const route = useRoute()
const translation = useTranslation()
await translation.load()
const input = ref(String(route.query.q ?? ''))
const PAGE = 25

interface Hit { book_id: number; chapter: number; verse: number; snippet: string }

const term = computed(() => String(route.query.q ?? ''))
const page = computed(() => Math.max(1, Number(route.query.p) || 1))

const { data, pending, error } = await useAsyncData(
  'search',
  async () => {
    const q = toFtsQuery(term.value, { prefix: false })
    if (!q) return null
    const base = { q, translation: translation.id.value }
    const [hits, total] = await Promise.all([
      query<Hit>('search_verses', { ...base, limit: PAGE, offset: (page.value - 1) * PAGE }),
      query<{ total: number }>('search_verses_count', base),
    ])
    return { hits, total: total[0]?.total ?? 0 }
  },
  { watch: [term, page, translation.id] },
)

watch(term, (t) => { input.value = t })

function submit() {
  navigateTo({ path: '/search', query: { q: input.value.trim() || undefined } })
}

// snippet() wraps hits in control characters 0x02/0x03. Split on them and render <mark> ourselves: no v-html.
function segments(snippet: string): Array<{ text: string; hit: boolean }> {
  return snippet.split(/(\u0002[^\u0003]*\u0003)/).filter(Boolean).map((s) =>
    s.startsWith('\u0002') ? { text: s.slice(1, -1), hit: true } : { text: s, hit: false })
}

const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / PAGE)))
useHead({ title: 'Search · Pellikan' })
</script>

<template>
  <div class="h-full overflow-y-auto p-2 md:p-4">
    <div class="mx-auto max-w-3xl rounded-xl border border-line bg-surface px-4 py-5 md:px-6 md:py-6">
      <h1 class="font-reading text-3xl font-semibold">Search the {{ translation.info.value?.name ?? 'Bible' }}</h1>
      <form class="mt-4 flex gap-2" @submit.prevent="submit">
        <div class="flex flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent">
          <Search class="size-4 text-muted" aria-hidden="true" />
          <input v-model="input" type="search" placeholder='love, "good shepherd", faith hope' aria-label="Search terms" class="h-10 flex-1 bg-transparent outline-none placeholder:text-faint" />
        </div>
        <button class="rounded-lg bg-accent px-4 font-medium text-accent-fg hover:opacity-90">Search</button>
      </form>
      <p class="mt-2 text-xs text-faint">Words are stemmed (loved finds love). Put a phrase in quotes. Every word must appear in the verse.</p>

      <p v-if="error" class="mt-6 text-red-500">Search failed: {{ error.statusMessage || error.message }}</p>
      <p v-else-if="pending" class="mt-6 text-muted">Searching…</p>
      <template v-else-if="data">
        <p class="mt-6 text-sm text-muted">{{ data.total.toLocaleString() }} verse{{ data.total === 1 ? '' : 's' }}</p>
        <ul class="mt-2 divide-y divide-line">
          <li v-for="h in data.hits" :key="`${h.book_id}-${h.chapter}-${h.verse}`" class="py-3">
            <NuxtLink :to="{ path: `/read/${BOOK_BY_ID[h.book_id]?.osis}/${h.chapter}`, query: { v: h.verse } }" class="font-medium text-accent hover:underline">
              {{ BOOK_BY_ID[h.book_id]?.name }} {{ h.chapter }}:{{ h.verse }}
            </NuxtLink>
            <p class="font-reading">
              <template v-for="(s, i) in segments(h.snippet)" :key="i"><mark v-if="s.hit" class="hit">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template>
            </p>
          </li>
        </ul>
        <p v-if="data.total === 0" class="mt-4">No verses matched.</p>
        <nav v-if="pages > 1" class="mt-6 flex items-center gap-4 text-sm" aria-label="Pages">
          <NuxtLink v-if="page > 1" :to="{ path: '/search', query: { q: term, p: page - 1 } }" class="text-accent hover:underline">&larr; Previous</NuxtLink>
          <span class="text-muted">Page {{ page }} of {{ pages }}</span>
          <NuxtLink v-if="page < pages" :to="{ path: '/search', query: { q: term, p: page + 1 } }" class="text-accent hover:underline">Next &rarr;</NuxtLink>
        </nav>
      </template>
    </div>
  </div>
</template>
