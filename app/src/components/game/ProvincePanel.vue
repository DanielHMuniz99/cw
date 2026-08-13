<script setup lang="ts">
import type { Army, Province } from '../../types/game'

defineProps<{
  province: Province | null
  army: Army | null
  isMoveMode: boolean
  canMoveSelectedArmy: boolean
  canPromoteSelectedArmyToAttack: boolean
  moveDisabledReason: string | null
}>()

const emit = defineEmits<{
  (event: 'start-move'): void
  (event: 'cancel-move'): void
  (event: 'set-attack-mode'): void
}>()
</script>

<template>
  <aside class="province-panel">
    <section v-if="province" class="card">
      <h2>{{ province.name }}</h2>
      <dl>
        <div>
          <dt>ID</dt>
          <dd>{{ province.id }}</dd>
        </div>
        <div>
          <dt>Proprietario</dt>
          <dd class="owner">{{ province.owner }}</dd>
        </div>
        <div>
          <dt>Coordenadas</dt>
          <dd>{{ province.centerX }}, {{ province.centerY }}</dd>
        </div>
      </dl>
    </section>

    <section v-else-if="army" class="card">
      <h2>{{ army.name }}</h2>
      <dl>
        <div>
          <dt>ID</dt>
          <dd>{{ army.id }}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{{ army.type }}</dd>
        </div>
        <div>
          <dt>Pais</dt>
          <dd>{{ army.country }}</dd>
        </div>
        <div>
          <dt>Ataque</dt>
          <dd>{{ army.attack }}</dd>
        </div>
        <div>
          <dt>Defesa</dt>
          <dd>{{ army.defense }}</dd>
        </div>
        <div>
          <dt>Vida</dt>
          <dd>{{ army.health }}/{{ army.maxHealth }}</dd>
        </div>
        <div>
          <dt>Combate</dt>
          <dd>{{ army.inCombat ? 'Em combate' : 'Fora de combate' }}</dd>
        </div>
        <div>
          <dt>Postura</dt>
          <dd>{{ army.combatMode === 'attack' ? 'Ataque' : 'Defesa' }}</dd>
        </div>
        <div>
          <dt>Provincia</dt>
          <dd>{{ army.provinceId }}</dd>
        </div>
        <div>
          <dt>Posicao</dt>
          <dd>{{ army.x }}, {{ army.y }}</dd>
        </div>
      </dl>

      <div class="actions">
        <button
          v-if="canMoveSelectedArmy && !isMoveMode"
          type="button"
          class="action-button"
          @click="emit('start-move')"
        >
          Mover
        </button>
        <p v-else-if="canMoveSelectedArmy" class="move-hint">
          Modo mover ativo: clique na proxima provincia para mover a unidade.
        </p>
        <p v-else-if="moveDisabledReason" class="blocked-hint">
          {{ moveDisabledReason }}
        </p>
        <button
          v-if="isMoveMode && canMoveSelectedArmy"
          type="button"
          class="action-button ghost"
          @click="emit('cancel-move')"
        >
          Cancelar
        </button>
        <button
          v-if="canPromoteSelectedArmyToAttack"
          type="button"
          class="action-button danger"
          @click="emit('set-attack-mode')"
        >
          Entrar no ataque
        </button>
      </div>
    </section>

    <section v-else class="card empty">
      <h2>Nenhum item selecionado</h2>
      <p>Clique em uma provincia ou unidade para ver detalhes.</p>
    </section>
  </aside>
</template>

<style scoped>
.province-panel {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  flex: 0 0 280px;
  height: 100%;
  padding: 1rem;
  background: linear-gradient(180deg, #111827, #0b1224);
  border-left: 1px solid rgba(148, 163, 184, 0.25);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable both-edges;
}

.card {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.9rem;
  padding: 1rem;
  color: #e2e8f0;
}

.card h2 {
  margin: 0 0 0.9rem;
  font-size: 1.2rem;
  color: #f8fafc;
}

.empty p {
  margin: 0;
  color: #cbd5e1;
}

dl {
  display: grid;
  gap: 0.7rem;
  margin: 0;
}

dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

dd {
  margin: 0.25rem 0 0;
  font-weight: 700;
}

.owner {
  text-transform: capitalize;
}

.actions {
  margin-top: 1rem;
  display: grid;
  gap: 0.6rem;
}

.action-button {
  background: #0ea5e9;
  color: #f8fafc;
  border: none;
  border-radius: 0.55rem;
  padding: 0.55rem 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.action-button:hover {
  background: #0284c7;
}

.action-button.ghost {
  background: rgba(148, 163, 184, 0.2);
}

.action-button.ghost:hover {
  background: rgba(148, 163, 184, 0.35);
}

.action-button.danger {
  background: #ef4444;
}

.action-button.danger:hover {
  background: #dc2626;
}

.move-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #bfdbfe;
}

.blocked-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #fca5a5;
}

@media (max-width: 1000px) {
  .province-panel {
    width: auto;
    min-width: 0;
    max-width: none;
    flex: 1 1 auto;
    height: auto;
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.25);
  }
}
</style>
