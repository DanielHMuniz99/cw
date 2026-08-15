<script setup lang="ts">
import type { CombatTroop } from '../../utils/troopLogic'

const props = defineProps<{
  troop: CombatTroop | null
  isMovementMode: boolean
  groupName?: string | null
  selectionCount?: number
}>()

const emit = defineEmits<{
  (event: 'move'): void
  (event: 'frontline'): void
  (event: 'close'): void
}>()
</script>

<template>
  <div v-if="troop" class="troop-panel">
    <div class="panel-header">
      <h3>{{ props.groupName ? 'Grupo selecionado' : 'Tropa selecionada' }}</h3>
      <button type="button" class="close-button" aria-label="Fechar painel da tropa" @click="emit('close')">×</button>
    </div>
    <p><strong>{{ props.groupName ?? troop.label }}</strong></p>
    <p v-if="props.selectionCount && props.selectionCount > 1" class="selection-summary">
      {{ props.selectionCount }} tropas selecionadas
    </p>
    <p v-else class="selection-summary">
      {{ troop.label }}
    </p>

    <button type="button" class="action-button" @click="emit('move')">
      {{ isMovementMode ? 'Aguardando destino...' : props.groupName ? 'Mover grupo' : 'Mover' }}
    </button>

    <button v-if="props.groupName" type="button" class="action-button secondary-button" @click="emit('frontline')">
      Criar linha de frente
    </button>
  </div>
</template>

<style scoped>
.troop-panel {
  position: absolute;
  right: 1.5rem;
  bottom: 1.5rem;
  width: min(140px, 15vw);
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.troop-panel h3 {
  margin: 0;
  font-size: 1rem;
  color: #f8fafc;
}

.close-button {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(30, 41, 59, 0.9);
  color: #f8fafc;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}

.troop-panel p {
  margin: 0 0 0.85rem;
  color: #cbd5e1;
}

.selection-summary {
  margin-top: -0.3rem;
  margin-bottom: 0.85rem;
  color: #cbd5e1;
  font-size: 0.82rem;
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

.secondary-button {
  margin-top: 0.5rem;
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.12);
  color: #fef3c7;
}
</style>
