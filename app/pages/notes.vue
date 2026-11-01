<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { BOOK_BY_OSIS } from '~~/shared/books'

const { notes, removeNote } = useUserData()
const sorted = computed(() => [...notes.value].sort((a, b) => b.at - a.at))
const label = (n: { osis: string; chapter: number; verse: number }) => `${BOOK_BY_OSIS[n.osis]?.name ?? n.osis} ${n.chapter}:${n.verse}`
useHead({ title: 'Notes · Pellikan' })
</script>

<template>
  <div class="h-full overflow-y-auto p-2 md:p-4">
    <div class="mx-auto max-w-3xl rounded-xl border border-line bg-surface px-4 py-5 md:px-6 md:py-6">
      <h1 class="font-reading text-3xl font-semibold">Notes</h1>
      <p v-if="!sorted.length" class="mt-4 text-muted">No notes yet. Select a verse while reading and write one in the Notes panel.</p>
      <ul v-else class="mt-4 space-y-3">
        <li v-for="n in sorted" :key="n.id" class="rounded-r-lg border-l-[3px] border-brand bg-surface-2 py-2 pl-3 pr-2">
          <div class="flex items-center justify-between">
            <NuxtLink :to="{ path: `/read/${n.osis}/${n.chapter}`, query: { v: n.verse } }" class="font-medium text-brand hover:underline">{{ label(n) }}</NuxtLink>
            <button type="button" class="rounded p-1 text-faint hover:text-fg" :aria-label="`Delete note on ${label(n)}`" @click="removeNote(n.id)"><Trash2 class="size-4" /></button>
          </div>
          <p class="mt-1 whitespace-pre-wrap">{{ n.body }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
