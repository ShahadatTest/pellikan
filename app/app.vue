<script setup lang="ts">
import { parseReference } from '~~/shared/reference'

const jump = ref('')
const jumpError = ref(false)

function go() {
  const ref_ = parseReference(jump.value)
  jumpError.value = !ref_
  if (!ref_) return
  navigateTo({ path: `/read/${ref_.book.osis}/${ref_.chapter ?? 1}`, query: ref_.verse ? { v: ref_.verse } : {} })
  jump.value = ''
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center gap-4 border-b border-black/10 px-5 py-3 dark:border-white/10">
      <NuxtLink to="/" class="font-reading text-lg font-semibold tracking-tight text-accent dark:text-amber-300">Scriptorium</NuxtLink>
      <form class="flex-1" @submit.prevent="go">
        <input
          v-model="jump"
          type="text"
          placeholder="Go to a passage: Rom 8:28, 1 Cor 13, Ps 23"
          class="w-full max-w-md rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          :class="jumpError ? 'border-red-500' : 'border-black/15 dark:border-white/15'"
          aria-label="Go to a passage"
          @input="jumpError = false"
        />
      </form>
      <nav class="flex gap-4 text-sm">
        <NuxtLink to="/search" class="hover:underline">Search</NuxtLink>
        <NuxtLink to="/credits" class="hover:underline">Credits</NuxtLink>
      </nav>
    </header>
    <main class="min-h-0 flex-1">
      <NuxtPage />
    </main>
  </div>
</template>
