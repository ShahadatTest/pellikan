<script setup lang="ts">
interface Source {
  id: string; name: string; kind: string; license: string; license_url: string | null; attribution: string
  source_url: string; edition: string | null
}
const { data: sources, error } = await useAsyncData('sources', () => query<Source>('sources'))
useHead({ title: 'Credits · Scriptorium' })
</script>

<template>
  <div class="mx-auto h-full max-w-3xl overflow-y-auto px-6 py-8">
    <h1 class="font-reading text-3xl font-semibold">Credits and licenses</h1>
    <p class="mt-2 text-black/70 dark:text-white/70">
      Scriptorium is built on the work of others. This page is generated from the data files bundled with the app.
    </p>
    <p v-if="error" class="mt-6 text-red-700 dark:text-red-400">Could not load credits: {{ error.statusMessage || error.message }}</p>
    <ul v-else class="mt-6 space-y-6">
      <li v-for="s in sources" :key="s.id">
        <h2 class="font-reading text-xl font-semibold">{{ s.name }}</h2>
        <p class="mt-1">{{ s.attribution }}</p>
        <p class="mt-1 text-sm text-black/65 dark:text-white/65">
          License: {{ s.license }} ·
          <a v-if="s.license_url" :href="s.license_url" target="_blank" rel="noopener noreferrer" class="underline">terms</a> ·
          <a :href="s.source_url" target="_blank" rel="noopener noreferrer" class="underline">source</a>
          <template v-if="s.edition"> · {{ s.edition }}</template>
        </p>
      </li>
    </ul>
    <p class="mt-10 text-sm text-black/60 dark:text-white/60">
      Search and study tools surface what the texts say. They cannot tell you what the Spirit is saying to you; that
      takes prayer, Scripture read in context, and your community.
    </p>
  </div>
</template>
