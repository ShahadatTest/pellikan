<script setup lang="ts">
import { Landmark } from 'lucide-vue-next'
import { decodeGreekMorph, decodeHebrewMorph } from '~~/shared/morph'
import type { Word } from '~/utils/types'

const props = defineProps<{ words: Word[]; verse: number; label: string; testament: 'OT' | 'NT'; picked: Word | null }>()
const emit = defineEmits<{ pick: [w: Word] }>()

const verseWords = computed(() => props.words.filter((w) => w.verse === props.verse && w.variant !== 'qere'))
const rtl = computed(() => !!verseWords.value[0] && verseWords.value[0].lang !== 'grc')

function describe(w: Word): string {
  try {
    return w.lang === 'grc' ? decodeGreekMorph(w.pos ?? '', w.morph).summary : decodeHebrewMorph(w.morph).summary
  } catch {
    return w.morph // never hide a code the decoder doesn't understand
  }
}
</script>

<template>
  <Panel :title="testament === 'NT' ? 'Interlinear Greek' : 'Original Hebrew'" :icon="Landmark">
    <template #actions><span class="text-sm text-muted">{{ label }}</span></template>
    <p v-if="!verseWords.length" class="text-sm text-muted">No original-language words for this verse in the bundled texts.</p>
    <ul v-else class="flex gap-1 overflow-x-auto pb-2" :dir="rtl ? 'rtl' : 'ltr'">
      <li v-for="w in verseWords" :key="w.id" class="shrink-0">
        <button
          type="button"
          class="flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 hover:bg-surface-2"
          :class="picked?.id === w.id ? 'bg-accent-soft' : ''"
          :title="describe(w)"
          @click="emit('pick', w)"
        >
          <span :lang="w.lang === 'grc' ? 'grc' : 'he'" :class="w.lang === 'grc' ? 'font-greek text-xl' : 'font-hebrew text-2xl'">{{ w.text }}</span>
          <span class="text-xs text-muted" dir="ltr">{{ w.lemma ?? w.strongs ?? '' }}</span>
          <span class="text-[0.7rem] text-faint" dir="ltr">{{ w.strongs ?? '' }}</span>
        </button>
      </li>
    </ul>
  </Panel>
</template>
