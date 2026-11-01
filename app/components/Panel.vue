<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

defineProps<{ title: string; icon?: Component; collapsible?: boolean }>()
const open = defineModel<boolean>('open', { default: true })
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface" :class="open ? 'flex-1' : 'flex-none'" :aria-label="title">
    <header class="flex items-center gap-2.5 px-4 py-3">
      <component :is="icon" v-if="icon" class="size-5 shrink-0 text-accent" aria-hidden="true" />
      <h2 class="truncate text-[0.95rem] font-semibold">{{ title }}</h2>
      <div class="ml-auto flex items-center gap-1 text-muted">
        <slot name="actions" />
        <button
          v-if="collapsible"
          type="button"
          class="grid size-7 place-items-center rounded-md hover:bg-surface-2 hover:text-fg"
          :aria-expanded="open"
          :aria-label="`${open ? 'Collapse' : 'Expand'} ${title}`"
          @click="open = !open"
        ><ChevronDown class="size-4 transition-transform" :class="open ? '' : '-rotate-90'" /></button>
      </div>
    </header>
    <div v-show="open" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <slot />
    </div>
  </section>
</template>
