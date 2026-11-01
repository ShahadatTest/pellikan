<script setup lang="ts">
const route = useRoute()
const items = useNavItems()
</script>

<template>
  <aside data-chrome class="hidden h-full w-60 shrink-0 flex-col md:flex border-r border-line bg-rail px-3 pb-4 pt-5" aria-label="Primary">
    <NuxtLink to="/" class="mb-6 flex items-center gap-3 px-2" aria-label="Pellikan home">
      <img src="/pellikan-mark-dark.svg" alt="" width="44" height="44" class="hidden size-11 dark:block" />
      <img src="/pellikan-mark.svg" alt="" width="44" height="44" class="block size-11 dark:hidden" />
      <span class="text-[1.05rem] font-extrabold tracking-[0.18em] text-fg">PELLIKAN</span>
    </NuxtLink>

    <nav class="flex flex-col gap-1">
      <NuxtLink
        v-for="i in items"
        :key="i.label"
        :to="i.to"
        class="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.95rem] transition-colors"
        :class="i.active ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'"
        :aria-current="i.active ? 'page' : undefined"
      >
        <span v-if="i.active" class="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" aria-hidden="true" />
        <component :is="i.icon" class="size-5 shrink-0" :class="i.active ? 'text-accent' : ''" aria-hidden="true" />
        {{ i.label }}
      </NuxtLink>
    </nav>

    <div class="mt-auto">
      <NuxtLink to="/credits" class="mb-3 block px-3 text-xs text-faint hover:text-fg" :class="route.path === '/credits' ? 'text-fg' : ''">Credits and licenses</NuxtLink>
      <div class="relative overflow-hidden rounded-xl border border-line bg-surface px-4 py-5 text-center">
        <svg class="pointer-events-none absolute -left-2 top-1 size-20 text-accent opacity-15" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
          <path d="M8 56C8 28 26 8 58 6c0 28-14 46-40 48l-6 6-4-4 6-6C14 50 12 53 8 56Z" />
        </svg>
        <p class="relative font-reading text-[0.95rem] italic leading-snug text-muted">Study deeply.<br />Own your library.</p>
      </div>
    </div>
  </aside>
</template>
