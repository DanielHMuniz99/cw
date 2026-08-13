<script setup lang="ts">
const emit = defineEmits<{
  (event: 'zoom-in'): void
  (event: 'zoom-out'): void
  (event: 'reset'): void
}>()
</script>

<template>
  <div class="map-controls">
    <button type="button" @click="emit('zoom-in')">+</button>
    <button type="button" @click="emit('zoom-out')">-</button>
    <button type="button" class="reset" @click="emit('reset')">Reset</button>
  </div>
</template>

<style scoped>
.map-controls {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  z-index: 3;
}

button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(15, 23, 42, 0.8);
  color: #f8fafc;
  font-weight: 700;
  border-radius: 0.5rem;
  width: 2.2rem;
  height: 2.2rem;
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

button:hover {
  background: rgba(30, 41, 59, 0.95);
  transform: translateY(-1px);
}

button.reset {
  width: auto;
  padding: 0 0.85rem;
}
</style>
