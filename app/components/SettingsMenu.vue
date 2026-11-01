<script setup lang="ts">
import { Settings, Sun, Moon, Monitor } from 'lucide-vue-next'
import type { ThemeChoice } from '~/composables/useTheme'

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const { choice, set } = useTheme()
const { prefs, setPrefs } = useUserData()

function onDoc(e: MouseEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

const themes: Array<{ id: ThemeChoice; label: string; icon: typeof Sun }> = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor },
]
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
      aria-label="Reading settings"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = !open"
    ><Settings class="size-5" /></button>

    <div v-if="open" role="dialog" aria-label="Reading settings" class="absolute right-0 top-12 z-40 w-72 rounded-xl border border-line bg-surface p-4 shadow-2xl">
      <p class="text-xs font-semibold uppercase tracking-wider text-faint">Theme</p>
      <div class="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-bg p-1" role="radiogroup" aria-label="Theme">
        <button
          v-for="t in themes"
          :key="t.id"
          type="button"
          role="radio"
          :aria-checked="choice === t.id"
          class="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm"
          :class="choice === t.id ? 'bg-accent-soft text-fg' : 'text-muted hover:text-fg'"
          @click="set(t.id)"
        ><component :is="t.icon" class="size-4" />{{ t.label }}</button>
      </div>

      <p class="mt-4 text-xs font-semibold uppercase tracking-wider text-faint">Text size</p>
      <div class="mt-2 flex items-center gap-3">
        <span class="text-sm text-muted">A</span>
        <input
          type="range" min="16" max="30" step="1"
          :value="prefs.fontSize"
          class="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
          aria-label="Reading text size"
          @input="setPrefs({ fontSize: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="font-reading text-xl text-muted">A</span>
      </div>

      <label class="mt-4 flex cursor-pointer items-center justify-between text-sm">
        Words of Jesus in red
        <input type="checkbox" :checked="prefs.redLetters" class="size-4 accent-[var(--accent)]" @change="setPrefs({ redLetters: ($event.target as HTMLInputElement).checked })" />
      </label>
    </div>
  </div>
</template>
