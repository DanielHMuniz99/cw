<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameMapView from './views/GameMapView.vue'
import MapEditorView from './views/MapEditorView.vue'
import MapCentersCreatorView from './views/MapCentersCreatorView.vue'
import CombatMapTestView from './views/CombatMapTestView.vue'
import MapVisualCreatorView from './views/MapVisualCreatorView.vue'
import MapViewer from './views/MapViewer.vue'


type MapVariant = 'default' | 'world' | 'editor' | 'centers-creator' | 'visual-creator' | 'combat-test' | 'viewer'

const currentPath = ref(window.location.pathname)
const currentSearch = ref(window.location.search)

const mapVariant = computed<MapVariant>(() => {
  const searchParams = new URLSearchParams(currentSearch.value)
  const mapQuery = searchParams.get('map')?.toLowerCase()

  if (currentPath.value === '/world-map' || mapQuery === 'world') {
    return 'world'
  }

  if (currentPath.value === '/map-editor' || mapQuery === 'editor') {
    return 'editor'
  }

  if (currentPath.value === '/map-centers-creator' || mapQuery === 'centers') {
    return 'centers-creator'
  }

  if (currentPath.value === '/map-visual-creator' || mapQuery === 'visual') {
    return 'visual-creator'
  }

  if (currentPath.value === '/combat-test' || mapQuery === 'combat') {
    return 'combat-test'
  }

  if (currentPath.value === '/map' || mapQuery === 'viewer') {
    return 'viewer'
  }

  return 'default'
})

function syncFromLocation() {
  currentPath.value = window.location.pathname
  currentSearch.value = window.location.search
}

function navigateTo(url: string) {
  if (window.location.pathname === url && window.location.search.length === 0) {
    return
  }

  window.history.pushState({}, '', url)
  syncFromLocation()
}

onMounted(() => {
  window.addEventListener('popstate', syncFromLocation)
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', syncFromLocation)
})
</script>

<template>
  <div class="app-shell">
    <nav v-if="mapVariant !== 'combat-test'" class="map-switcher">
      <button
        type="button"
        :class="{ active: mapVariant === 'default' }"
        @click="navigateTo('/')"
      >
        Mapa Padrão
      </button>

      <button
        type="button"
        :class="{ active: mapVariant === 'viewer' }"
        @click="navigateTo('/map')"
      >
        Mapa Padrão
      </button>

      <button
        type="button"
        :class="{ active: mapVariant === 'world' }"
        @click="navigateTo('/world-map')"
      >
        Mapa Gerado
      </button>

      <button
        type="button"
        :class="{ active: mapVariant === 'editor' }"
        @click="navigateTo('/map-editor')"
      >
        Editor
      </button>

      <button
        type="button"
        :class="{ active: mapVariant === 'centers-creator' }"
        @click="navigateTo('/map-centers-creator')"
      >
        Criar Centros
      </button>

      <button
        type="button"
        :class="{ active: mapVariant === 'visual-creator' }"
        @click="navigateTo('/map-visual-creator')"
      >
        Criar Visual
      </button>

    </nav>

    <GameMapView v-if="mapVariant === 'default' || mapVariant === 'world'" :key="mapVariant" :map-variant="mapVariant" />
    <MapEditorView v-else-if="mapVariant === 'editor'" :key="mapVariant" />
    <MapCentersCreatorView v-else-if="mapVariant === 'centers-creator'" :key="mapVariant" />
    <MapVisualCreatorView v-else-if="mapVariant === 'visual-creator'" :key="mapVariant" />
    <CombatMapTestView v-else-if="mapVariant === 'combat-test'" :key="mapVariant" />
    <MapViewer v-else-if="mapVariant === 'viewer'" :key="mapVariant" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.map-switcher {
  position: fixed;
  top: 0.7rem;
  right: 0.7rem;
  z-index: 12;
  display: flex;
  gap: 0.5rem;
}

.map-switcher button {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.82);
  color: #dbeafe;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.map-switcher button.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(96, 165, 250, 0.8);
  color: #eff6ff;
}
</style>
