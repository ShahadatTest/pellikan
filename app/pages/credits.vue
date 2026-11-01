<script setup lang="ts">
interface Source {
  id: string; name: string; kind: string; license: string; license_url: string | null; attribution: string
  source_url: string; edition: string | null
}
const { data: sources, error } = await useAsyncData('sources', () => query<Source>('sources'))
// Translations the user downloaded are not in bible.db, but their credits belong on this page too.
const translation = useTranslation()
await translation.load()
const downloaded = computed(() => translation.list.value.filter((t) => t.pack))
useHead({ title: 'Credits · Pellikan' })
</script>

<template>
  <div class="h-full overflow-y-auto p-2 md:p-4">
    <div class="mx-auto max-w-3xl rounded-xl border border-line bg-surface px-4 py-5 md:px-6 md:py-6">
      <h1 class="font-reading text-3xl font-semibold">Credits and licenses</h1>
      <p class="mt-2 text-muted">Pellikan is built on the work of others. This page is generated from the data files bundled with the app.</p>
      <p v-if="error" class="mt-6 text-red-500">Could not load credits: {{ error.statusMessage || error.message }}</p>
      <ul v-else class="mt-6 space-y-6">
        <li v-for="s in sources" :key="s.id">
          <h2 class="font-reading text-xl font-semibold">{{ s.name }}</h2>
          <p class="mt-1">{{ s.attribution }}</p>
          <p class="mt-1 text-sm text-muted">
            License: {{ s.license }} ·
            <a v-if="s.license_url" :href="s.license_url" target="_blank" rel="noopener noreferrer" class="text-accent underline">terms</a> ·
            <a :href="s.source_url" target="_blank" rel="noopener noreferrer" class="text-accent underline">source</a>
            <template v-if="s.edition"> · {{ s.edition }}</template>
          </p>
        </li>
      </ul>
      <template v-if="downloaded.length">
        <h2 class="mt-10 font-reading text-2xl font-semibold">Downloaded translations</h2>
        <ul class="mt-4 space-y-6">
          <li v-for="s in downloaded" :key="s.id">
            <h3 class="font-reading text-xl font-semibold">{{ s.name }}</h3>
            <p class="mt-1">{{ s.attribution }}</p>
            <p class="mt-1 text-sm text-muted">
              License: {{ s.license }}
              <template v-if="s.license_url"> · <a :href="s.license_url" target="_blank" rel="noopener noreferrer" class="text-accent underline">terms</a></template>
              <template v-if="s.source_url"> · <a :href="s.source_url" target="_blank" rel="noopener noreferrer" class="text-accent underline">source</a></template>
            </p>
          </li>
        </ul>
      </template>
      <p class="mt-10 text-sm text-faint">
        Search and study tools surface what the texts say. They cannot tell you what the Spirit is saying to you; that
        takes prayer, Scripture read in context, and your community.
      </p>
    </div>
  </div>
</template>
