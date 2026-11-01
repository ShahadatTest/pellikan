<script setup lang="ts">
import { Search, Sun, Moon } from 'lucide-vue-next'

const paletteOpen = useState('palette-open', () => false)
const { toggle, choice } = useTheme()
// Re-evaluates when the choice changes; "system" resolves on the client.
const dark = computed(() => (import.meta.client ? (choice.value === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : choice.value === 'dark') : true))
const isMac = import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <div data-chrome class="flex items-center gap-3 px-5 pt-4">
    <button
      type="button"
      class="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-muted hover:border-faint"
      aria-label="Search Scripture, go to a passage, or open a page"
      @click="paletteOpen = true"
    >
      <Search class="size-5 shrink-0" aria-hidden="true" />
      <span class="flex-1 truncate">Search Scripture or go to a passage…</span>
      <kbd class="rounded-md border border-line bg-bg px-2 py-0.5 text-xs text-faint">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
    </button>
    <button
      type="button"
      class="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggle"
    >
      <Sun v-if="dark" class="size-5" />
      <Moon v-else class="size-5" />
    </button>
    <SettingsMenu />
  </div>
</template>
