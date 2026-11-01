<script setup lang="ts">
const items = useNavItems()
</script>

<template>
  <nav data-chrome class="flex shrink-0 border-t border-line bg-rail pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary">
    <NuxtLink
      v-for="i in items"
      :key="i.label"
      :to="i.to"
      class="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem]"
      :class="i.active ? 'font-medium text-accent' : 'text-muted'"
      :aria-current="i.active ? 'page' : undefined"
    >
      <component :is="i.icon" class="size-5" aria-hidden="true" />
      <span class="truncate">{{ i.label }}</span>
    </NuxtLink>
  </nav>
</template>
