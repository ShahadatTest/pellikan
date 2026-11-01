<script setup lang="ts">
import { BOOK_BY_OSIS } from '~~/shared/books'

const { highlights } = useUserData()
const items = computed(() =>
  Object.entries(highlights.value).map(([k, color]) => {
    const [osis, ch, v] = k.split('.')
    const book = BOOK_BY_OSIS[osis!]
    return { key: k, osis: osis!, chapter: Number(ch), verse: Number(v), color, order: (book?.id ?? 0) * 1e6 + Number(ch) * 1e3 + Number(v), name: book?.name ?? osis }
  }).sort((a, b) => a.order - b.order),
)
useHead({ title: 'Highlights · Pellikan' })
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="mx-auto max-w-3xl rounded-xl border border-line bg-surface px-6 py-6">
      <h1 class="font-reading text-3xl font-semibold">Highlights</h1>
      <p v-if="!items.length" class="mt-4 text-muted">No highlights yet. Select a verse while reading and pick a colour in the Notes panel.</p>
      <ul v-else class="mt-4 space-y-2">
        <li v-for="h in items" :key="h.key">
          <NuxtLink :to="{ path: `/read/${h.osis}/${h.chapter}`, query: { v: h.verse } }" class="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
            <span class="size-4 shrink-0 rounded-full border border-line" :style="{ background: `var(--hl-${h.color})` }" aria-hidden="true" />
            <span class="font-medium text-accent">{{ h.name }} {{ h.chapter }}:{{ h.verse }}</span>
            <span class="text-sm capitalize text-faint">{{ h.color }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
