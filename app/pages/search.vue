<script setup lang="ts">
import { BOOK_BY_ID } from '~~/shared/books'
import { toFtsQuery } from '~~/shared/text'

const route = useRoute()
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
    const base = { q, translation: TRANSLATION }
    const [hits, total] = await Promise.all([
      query<Hit>('search_verses', { ...base, limit: PAGE, offset: (page.value - 1) * PAGE }),
      query<{ total: number }>('search_verses_count', base),
    ])
    return { hits, total: total[0]?.total ?? 0 }
  },
  { watch: [term, page] },
)

function submit() {
  navigateTo({ path: '/search', query: { q: input.value.trim() || undefined } })
}

// snippet() wraps hits in control characters 0x02/0x03. Split on them and render <mark> ourselves: no v-html.
function segments(snippet: string): Array<{ text: string; hit: boolean }> {
  return snippet.split(/(\u0002[^\u0003]*\u0003)/).filter(Boolean).map((s) =>
    s.startsWith('\u0002') ? { text: s.slice(1, -1), hit: true } : { text: s, hit: false })
}

const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / PAGE)))
useHead({ title: 'Search · Scriptorium' })
</script>

<template>
  <div class="mx-auto h-full max-w-3xl overflow-y-auto px-6 py-8">
    <h1 class="font-reading text-3xl font-semibold">Search the World English Bible</h1>
    <form class="mt-4 flex gap-2" @submit.prevent="submit">
      <input v-model="input" type="search" placeholder='love, "good shepherd", faith hope' aria-label="Search terms"
        class="flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40 dark:border-white/15" />
      <button class="rounded-md bg-accent px-4 py-2 text-white hover:opacity-90">Search</button>
    </form>
    <p class="mt-2 text-xs text-black/55 dark:text-white/55">Words are stemmed (loved finds love). Put a phrase in quotes. Every word must appear in the verse.</p>

    <p v-if="error" class="mt-6 text-red-700 dark:text-red-400">Search failed: {{ error.statusMessage || error.message }}</p>
    <p v-else-if="pending" class="mt-6 text-black/55 dark:text-white/55">Searching…</p>
    <template v-else-if="data">
      <p class="mt-6 text-sm text-black/65 dark:text-white/65">{{ data.total.toLocaleString() }} verse{{ data.total === 1 ? '' : 's' }}</p>
      <ul class="mt-2 divide-y divide-black/10 dark:divide-white/10">
        <li v-for="h in data.hits" :key="`${h.book_id}-${h.chapter}-${h.verse}`" class="py-3">
          <NuxtLink :to="{ path: `/read/${BOOK_BY_ID[h.book_id]?.osis}/${h.chapter}`, query: { v: h.verse } }" class="font-medium text-accent hover:underline dark:text-amber-300">
            {{ BOOK_BY_ID[h.book_id]?.name }} {{ h.chapter }}:{{ h.verse }}
          </NuxtLink>
          <p class="font-reading">
            <template v-for="(s, i) in segments(h.snippet)" :key="i"><mark v-if="s.hit" class="hit">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template>
          </p>
        </li>
      </ul>
      <p v-if="data.total === 0" class="mt-4">No verses matched.</p>
      <nav v-if="pages > 1" class="mt-6 flex items-center gap-4 text-sm" aria-label="Pages">
        <NuxtLink v-if="page > 1" :to="{ path: '/search', query: { q: term, p: page - 1 } }" class="hover:underline">&larr; Previous</NuxtLink>
        <span>Page {{ page }} of {{ pages }}</span>
        <NuxtLink v-if="page < pages" :to="{ path: '/search', query: { q: term, p: page + 1 } }" class="hover:underline">Next &rarr;</NuxtLink>
      </nav>
    </template>
  </div>
</template>
