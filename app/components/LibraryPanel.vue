<script setup lang="ts">
import { Library } from 'lucide-vue-next'

interface Source { id: string; name: string; kind: string }
const { data: sources } = await useAsyncData('sources', () => query<Source>('sources'))

const KIND: Record<string, string> = { translation: 'Bible', 'original-text': 'Original text' }
const COLORS = ['#1f4a3a', '#5a2323', '#1f3350', '#4a3a1f']
</script>

<template>
  <Panel title="Library" :icon="Library">
    <template #actions><NuxtLink to="/library" class="text-sm text-accent hover:underline">View all</NuxtLink></template>
    <ul class="flex gap-3 overflow-x-auto pb-2">
      <li v-for="(s, i) in sources" :key="s.id" class="shrink-0">
        <NuxtLink to="/library" class="flex h-24 w-20 flex-col justify-between rounded-md p-2 text-white shadow-md ring-1 ring-white/10 hover:brightness-110" :style="{ background: COLORS[i % COLORS.length] }">
          <span class="text-[0.7rem] font-semibold leading-tight">{{ s.id }}</span>
          <span class="text-[0.6rem] opacity-70">{{ KIND[s.kind] ?? s.kind }}</span>
        </NuxtLink>
      </li>
    </ul>
  </Panel>
</template>
