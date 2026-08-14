<script setup lang="ts">
import type { CombatTroop } from '../../utils/troopLogic'

const props = defineProps<{
  troop: CombatTroop | null
  isMovementMode: boolean
}>()

const emit = defineEmits<{
  (event: 'move'): void
}>()
</script>

<template>
  <div v-if="troop" class="troop-panel">
    <h3>Tropa selecionada</h3>
    <p><strong>{{ troop.label }}</strong></p>

    <button type="button" class="action-button" @click="emit('move')">
      {{ isMovementMode ? 'Aguardando destino...' : 'Mover' }}
    </button>
  </div>
</template>

<style scoped>
.troop-panel {
  position: absolute;
  right: 1.5rem;
  bottom: 1.5rem;
  width: min(360px, 32vw);
  z-index: 25;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px;
  padding: 1rem;
  color: #e2e8f0;
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.45);
  pointer-events: auto;
}

.troop-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #f8fafc;
}

.troop-panel p {
  margin: 0 0 0.85rem;
  color: #cbd5e1;
}

.status-text {
  margin: 0 0 0.85rem;
  color: #cbd5e1;
  font-size: 0.9rem;
}

.action-button {
  margin-top: 0.2rem;
  border: 1px solid rgba(96, 165, 250, 0.5);
  background: rgba(37, 99, 235, 0.18);
  color: #eff6ff;
  border-radius: 12px;
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
}
</style>
