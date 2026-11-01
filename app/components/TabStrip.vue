<script setup lang="ts">
import { BookOpen, Search, FileText, X, Plus } from 'lucide-vue-next'

const { tabs, activeId, activate, close, open } = useTabs()
const icons = { read: BookOpen, search: Search, page: FileText }
const items = computed(() => tabs.value.map((t) => ({ ...t, ...tabTitle(t.path) })))
</script>

<template>
  <div data-chrome class="hidden items-end gap-1.5 overflow-x-auto px-5 pt-3 md:flex" role="tablist" aria-label="Open tabs">
    <div
      v-for="t in items"
      :key="t.id"
      class="group flex max-w-56 shrink-0 items-center rounded-t-lg border border-b-0 text-sm"
      :class="t.id === activeId ? 'border-accent/60 bg-surface text-fg' : 'border-line bg-rail text-muted hover:text-fg'"
    >
      <button type="button" role="tab" :aria-selected="t.id === activeId" class="flex min-w-0 items-center gap-2 py-2 pl-3 pr-1" @click="activate(t.id)">
        <component :is="icons[t.kind]" class="size-4 shrink-0" :class="t.id === activeId ? 'text-accent' : ''" aria-hidden="true" />
        <span class="truncate">{{ t.title }}</span>
      </button>
      <button type="button" class="mr-1.5 grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-surface-2 hover:text-fg" :aria-label="`Close ${t.title}`" @click="close(t.id)">
        <X class="size-3.5" />
      </button>
    </div>
    <button type="button" class="mb-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="New tab" @click="open()">
      <Plus class="size-4" />
    </button>
  </div>
</template>
