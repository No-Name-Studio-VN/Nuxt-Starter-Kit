<script setup lang="ts">
const config = useDocsConfig();
const search = computed(() => config.value.search);
</script>

<template>
  <LayoutSearchButton
    :enable="search.enable"
    :in-aside="search.inAside"
    search-style="button"
    :placeholder="search.placeholder"
  />
</template>
