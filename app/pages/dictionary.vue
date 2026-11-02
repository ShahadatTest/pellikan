<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { toFtsQuery } from '~~/shared/text'

// Easton's and Smith's Bible dictionaries. Typing looks up headwords by prefix ("aar" finds Aaron); the second list
// searches inside the entries ("tentmaker").
interface Row { id: number; source_id: string; headword: string; preview?: string; snippet?: string }
interface Entry { id: number; source_id: string; source_name: string; headword: string; body: string }

const route = useRoute()
const input = ref(String(route.query.q ?? ''))
const term = computed(() => String(route.query.q ?? '').trim())
const openId = computed(() => Number(route.query.id) || null)
const SHORT: Record<string, string> = { EASTON: "Easton's", SMITH: "Smith's" }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const { data, error } = await useAsyncData('dictionary-search', async () => {
  if (!term.value) return { heads: [] as Row[], inside: [] as Row[] }
  const fts = toFtsQuery(term.value, { prefix: false })
  const [heads, inside] = await Promise.all([
    query<Row>('dictionary_lookup', { prefix: fold(term.value), limit: 40 }),
    fts ? query<Row>('dictionary_search', { q: fts, limit: 25 }) : Promise.resolve([] as Row[]),
  ])
  const seen = new Set(heads.map((h) => h.id))
  return { heads, inside: inside.filter((r) => !seen.has(r.id)) }
}, { watch: [term] })

const { data: entry } = await useAsyncData('dictionary-entry', async () => {
  if (!openId.value) return null
  return (await query<Entry>('dictionary_entry', { id: openId.value }))[0] ?? null
}, { watch: [openId] })

function submit() { navigateTo({ path: '/dictionary', query: { q: input.value.trim() || undefined } }) }
const open = (id: number) => ({ path: '/dictionary', query: { q: term.value || undefined, id } })

// snippet() wraps hits in control characters 0x02/0x03; render <mark> ourselves, no v-html.
function segments(snippet: string) {
  return snippet.split(/(\u0002[^\u0003]*\u0003)/).filter(Boolean).map((s) =>
    s.startsWith('\u0002') ? { text: s.slice(1, -1), hit: true } : { text: s, hit: false })
}
useHead({ title: 'Dictionary · Pellikan' })
</script>

<template>
  <div class="h-full overflow-y-auto p-2 md:p-4">
    <div class="mx-auto max-w-5xl rounded-xl border border-line bg-surface px-4 py-5 md:px-6 md:py-6">
      <h1 class="font-reading text-3xl font-semibold">Dictionary</h1>
      <p class="mt-2 text-muted">Easton's Bible Dictionary and Smith's Bible Dictionary. Look up a person, place or term.</p>
      <form class="mt-4 flex gap-2" role="search" @submit.prevent="submit">
        <label class="sr-only" for="dict-q">Look up a word</label>
        <input id="dict-q" v-model="input" type="search" placeholder="Aaron, tabernacle, Nicodemus…" class="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent" />
        <button type="submit" class="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:brightness-110"><Search class="size-4" aria-hidden="true" />Look up</button>
      </form>
      <p v-if="error" class="mt-4 text-red-500">Lookup failed: {{ error.statusMessage || error.message }}</p>

      <div class="mt-6 grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <p v-if="!term" class="text-sm text-muted">Type a name or word above.</p>
          <template v-else-if="data">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">Entries starting with "{{ term }}"</h2>
            <p v-if="!data.heads.length" class="mt-1 text-sm text-muted">No entry starts with that.</p>
            <ul class="mt-1 space-y-1">
              <li v-for="r in data.heads" :key="r.id">
                <NuxtLink :to="open(r.id)" class="block rounded-md px-2 py-1.5 hover:bg-surface-2" :class="openId === r.id ? 'bg-accent-soft' : ''">
                  <span class="font-medium">{{ r.headword }}</span>
                  <span class="ml-2 text-xs text-faint">{{ SHORT[r.source_id] ?? r.source_id }}</span>
                  <span class="block truncate text-xs text-muted">{{ r.preview }}</span>
                </NuxtLink>
              </li>
            </ul>
            <template v-if="data.inside.length">
              <h2 class="mt-5 text-xs font-semibold uppercase tracking-wider text-faint">Mentioned in</h2>
              <ul class="mt-1 space-y-1">
                <li v-for="r in data.inside" :key="r.id">
                  <NuxtLink :to="open(r.id)" class="block rounded-md px-2 py-1.5 hover:bg-surface-2" :class="openId === r.id ? 'bg-accent-soft' : ''">
                    <span class="font-medium">{{ r.headword }}</span>
                    <span class="ml-2 text-xs text-faint">{{ SHORT[r.source_id] ?? r.source_id }}</span>
                    <span class="block text-xs text-muted"><template v-for="(seg, i) in segments(r.snippet ?? '')" :key="i"><mark v-if="seg.hit" class="rounded-sm bg-sel px-0.5 text-fg">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template></span>
                  </NuxtLink>
                </li>
              </ul>
            </template>
          </template>
        </div>

        <article v-if="entry" class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wider text-brand">{{ entry.source_name }}</p>
          <h2 class="font-reading text-2xl font-semibold">{{ entry.headword }}</h2>
          <p v-for="(p, i) in entry.body.split('\n')" :key="i" class="mt-3 leading-relaxed">{{ p }}</p>
        </article>
        <p v-else-if="term" class="text-sm text-muted">Choose an entry to read it.</p>
      </div>
    </div>
  </div>
</template>
