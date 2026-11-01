<script setup lang="ts">
import { Download, Trash2, CheckCircle2, RefreshCw } from 'lucide-vue-next'

// Bible translations: the ones built into the app, the ones downloaded to this computer, and the ones on offer.
// Downloads come from the catalog (manifest) the app is configured with, never straight from ebible.org.
const translation = useTranslation()
await translation.load()

const catalog = ref<CatalogEntry[] | null>(null)
const catalogError = ref('')
const loadingCatalog = ref(false)
const busy = ref<Record<string, 'installing' | 'removing' | undefined>>({})
const failed = ref<Record<string, string>>({})
const confirming = ref<string | null>(null)
const done = ref('')

async function loadCatalog() {
  loadingCatalog.value = true; catalogError.value = ''
  try { catalog.value = await translationCommand<CatalogEntry[]>('translation_catalog') } catch (err) {
    catalog.value = null
    catalogError.value = errorMessage(err)
  } finally { loadingCatalog.value = false }
}
onMounted(loadCatalog)

const builtIn = computed(() => translation.list.value.filter((t) => !t.pack))
const downloaded = computed(() => translation.list.value.filter((t) => t.pack))
const available = computed(() => (catalog.value ?? []).filter((c) => !translation.list.value.some((t) => t.id === c.id)))
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`

async function install(id: string) {
  busy.value[id] = 'installing'; delete failed.value[id]; done.value = ''
  try {
    await translationCommand('install_translation', { id })
    await translation.refresh()
    done.value = `${id} is installed. It works offline from now on.`
  } catch (err) { failed.value[id] = errorMessage(err) } finally { busy.value[id] = undefined }
}
async function remove(id: string) {
  busy.value[id] = 'removing'; delete failed.value[id]; confirming.value = null; done.value = ''
  try {
    await translationCommand('remove_translation', { id })
    await translation.refresh()
  } catch (err) { failed.value[id] = errorMessage(err) } finally { busy.value[id] = undefined }
}
</script>

<template>
  <section id="translations" class="mt-8" aria-labelledby="translations-h">
    <h2 id="translations-h" class="font-reading text-2xl font-semibold">Bible translations</h2>
    <p class="mt-1 text-sm text-muted">
      {{ builtIn.map((t) => t.id).join(', ') }} come with the app and work offline. Other public-domain translations
      download once, then work offline too.
    </p>
    <p v-if="done" class="mt-3 flex items-center gap-2 text-sm text-accent" role="status"><CheckCircle2 class="size-4" aria-hidden="true" />{{ done }}</p>

    <ul class="mt-4 space-y-2">
      <li v-for="t in downloaded" :key="t.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-bg p-3">
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ t.id }} <span class="font-normal text-muted">· {{ t.name }}</span></p>
          <p class="text-xs text-faint">Downloaded</p>
        </div>
        <button type="button" class="rounded-md px-3 py-1.5 text-sm text-accent hover:bg-surface-2" @click="translation.set(t.id)">Read it</button>
        <template v-if="confirming === t.id">
          <button type="button" class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" :disabled="!!busy[t.id]" @click="remove(t.id)">Remove from this computer</button>
          <button type="button" class="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2" @click="confirming = null">Keep</button>
        </template>
        <button v-else type="button" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg" :disabled="!!busy[t.id]" :aria-label="`Remove ${t.id}`" @click="confirming = t.id">
          <Trash2 class="size-4" aria-hidden="true" />{{ busy[t.id] === 'removing' ? 'Removing…' : 'Remove' }}
        </button>
        <p v-if="failed[t.id]" class="w-full text-sm text-red-500">{{ failed[t.id] }}</p>
      </li>

      <li v-for="c in available" :key="c.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-bg p-3">
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ c.id }} <span class="font-normal text-muted">· {{ c.name }}</span></p>
          <p class="text-xs text-faint">{{ mb(c.bytes) }} download</p>
        </div>
        <button type="button" class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110 disabled:opacity-60" :disabled="!!busy[c.id]" :aria-label="`Download ${c.id}`" @click="install(c.id)">
          <Download class="size-4" aria-hidden="true" />{{ busy[c.id] === 'installing' ? 'Downloading…' : failed[c.id] ? 'Try again' : 'Download' }}
        </button>
        <p v-if="failed[c.id]" class="w-full text-sm text-red-500">{{ failed[c.id] }}</p>
      </li>
    </ul>

    <p v-if="loadingCatalog" class="mt-3 text-sm text-muted">Checking for more translations…</p>
    <div v-else-if="catalogError" class="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <p>Could not reach the translation catalog, so no new translations are listed. What you already have still works.</p>
      <p class="mt-1 text-xs text-faint">{{ catalogError }}</p>
      <button type="button" class="mt-2 inline-flex items-center gap-1.5 text-accent hover:underline" @click="loadCatalog"><RefreshCw class="size-3.5" aria-hidden="true" />Try again</button>
    </div>
    <p v-else-if="catalog && !available.length && !downloaded.length" class="mt-3 text-sm text-muted">No other translations are on offer right now.</p>
  </section>
</template>
