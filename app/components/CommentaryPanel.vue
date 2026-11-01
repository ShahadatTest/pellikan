<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next'
</script>

<template>
  <Panel title="Commentary" :icon="MessageSquareText">
    <p class="text-sm text-muted">No commentaries are installed yet.</p>
    <p class="mt-1 text-sm text-faint">Public-domain commentaries and your own imported books will appear here, matched to the passage you are reading.</p>
  </Panel>
</template>
