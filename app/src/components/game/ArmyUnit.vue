<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Army } from '../../types/game'
import { getCountryColor } from '../../data/countries'

const props = defineProps<{
  unit: Army
  isSelected: boolean
}>()

const emit = defineEmits<{
  (event: 'select', id: number): void
}>()

const isHovered = ref(false)

const unitColor = computed(() => {
  return getCountryColor(props.unit.country)
})

function selectUnit() {
  emit('select', props.unit.id)
}

function setHoverState(state: boolean) {
  isHovered.value = state
}
</script>

<template>
  <g
    class="army-unit"
    @click.stop="selectUnit"
    @mouseenter="setHoverState(true)"
    @mouseleave="setHoverState(false)"
  >
    <circle
      :cx="unit.x"
      :cy="unit.y + (isHovered ? 4 : 0)"
      r="11"
      class="unit-body"
      :class="{ selected: isSelected }"
      :fill="unitColor"
    />
    <circle :cx="unit.x" :cy="unit.y + (isHovered ? 4 : 0)" r="3" class="unit-core" fill="#111827" />
    <text :x="unit.x" :y="unit.y + 24 + (isHovered ? 4 : 0)" class="unit-label">{{ unit.type }}</text>
  </g>
</template>

<style scoped>
.army-unit {
  cursor: pointer;
}

.unit-body {
  stroke: #111827;
  stroke-width: 1.5;
  transition: cy 0.15s ease;
}

.unit-body.selected {
  stroke: #facc15;
  stroke-width: 3;
}

.unit-core,
.unit-label {
  transition: transform 0.15s ease;
}

.unit-label {
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
  fill: #111827;
  pointer-events: none;
}
</style>
