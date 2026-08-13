<script setup lang="ts">
import { computed, ref } from 'vue'
import GameMap from '../components/game/GameMap.vue'
import type { Province } from '../types/game'
import { provinces as worldProvinces } from '../data/generatedWorldMap'

const provincesState = ref<Province[]>(
  worldProvinces.map((province) => ({
    ...province,
    borders: [...province.borders],
  })),
)

const selectedProvinceId = ref<number | null>(null)
const hoveredProvinceId = ref<number | null>(null)
const borderInput = ref('')
const pointInput = ref('')
const centerOffsetX = ref('0')
const centerOffsetY = ref('0')
const showProvinceBorderLines = ref(true)

const selectedProvince = computed(() => {
  if (selectedProvinceId.value === null) {
    return null
  }

  return provincesState.value.find((province) => province.id === selectedProvinceId.value) ?? null
})

const provincesById = computed(() => {
  return new Map(provincesState.value.map((province) => [province.id, province]))
})

const mapViewBox = computed(() => {
  if (provincesState.value.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 1100,
      height: 620,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const province of provincesState.value) {
    const pairs = province.points.trim().split(/\s+/)

    for (const pair of pairs) {
      const [xText, yText] = pair.split(',')
      const x = Number(xText)
      const y = Number(yText)

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return {
    minX: minX - 220,
    minY: minY - 220,
    width: Math.max(1, maxX - minX + 440),
    height: Math.max(1, maxY - minY + 440),
  }
})

function selectProvince(provinceId: number) {
  selectedProvinceId.value = provinceId
}

function clearSelection() {
  selectedProvinceId.value = null
}

function toggleProvinceBorderLines() {
  showProvinceBorderLines.value = !showProvinceBorderLines.value
}

function parseBorderIds(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((token) => Number(token.trim()))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )
}

function addBorder() {
  if (!selectedProvince.value) {
    return
  }

  const newIds = parseBorderIds(borderInput.value)
  if (newIds.length === 0) {
    return
  }

  const province = selectedProvince.value
  const nextBorders = new Set(province.borders)

  for (const borderId of newIds) {
    if (borderId === province.id) {
      continue
    }

    const targetProvince = provincesById.value.get(borderId)
    if (!targetProvince) {
      continue
    }

    nextBorders.add(borderId)
    targetProvince.borders = Array.from(new Set([...targetProvince.borders, province.id])).sort((a, b) => a - b)
  }

  province.borders = Array.from(nextBorders).sort((a, b) => a - b)
  borderInput.value = ''
}

function removeBorder(borderId: number) {
  if (!selectedProvince.value) {
    return
  }

  const province = selectedProvince.value
  province.borders = province.borders.filter((id) => id !== borderId)

  const neighbor = provincesById.value.get(borderId)
  if (neighbor) {
    neighbor.borders = neighbor.borders.filter((id) => id !== province.id)
  }
}

function parsePointPair(value: string) {
  const [xText, yText] = value.split(',').map((item) => item.trim())
  const x = Number(xText)
  const y = Number(yText)

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return { x, y }
}

function pointEntriesForProvince(province: Province | null) {
  if (!province) {
    return []
  }

  return province.points
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((entry, index) => ({
      id: `${province.id}-${index}`,
      index,
      value: entry,
      x: Number(entry.split(',')[0]),
      y: Number(entry.split(',')[1]),
    }))
}

function syncProvinceGeometry(province: Province) {
  const centroid = getPolygonCentroid(province.points)
  province.centerX = centroid.x
  province.centerY = centroid.y
}

function addPoint() {
  if (!selectedProvince.value) {
    return
  }

  const value = pointInput.value.trim()
  if (!value) {
    return
  }

  const pair = parsePointPair(value)
  if (!pair) {
    return
  }

  const province = selectedProvince.value
  const existingPoints = province.points.trim().split(/\s+/).filter(Boolean)
  province.points = `${existingPoints.join(' ')} ${pair.x},${pair.y}`.trim()

  syncProvinceGeometry(province)
  pointInput.value = ''
}

function updatePoint(index: number, value: string) {
  if (!selectedProvince.value) {
    return
  }

  const pair = parsePointPair(value)
  if (!pair) {
    return
  }

  const province = selectedProvince.value
  const points = province.points.trim().split(/\s+/).filter(Boolean)
  points[index] = `${pair.x},${pair.y}`
  province.points = points.join(' ')
  syncProvinceGeometry(province)
}

function removePoint(index: number) {
  if (!selectedProvince.value) {
    return
  }

  const province = selectedProvince.value
  const points = province.points.trim().split(/\s+/).filter(Boolean)

  if (points.length <= 3) {
    return
  }

  points.splice(index, 1)
  province.points = points.join(' ')
  syncProvinceGeometry(province)
}

function removeLastPoint() {
  if (!selectedProvince.value) {
    return
  }

  const points = selectedProvince.value.points.trim().split(/\s+/).filter(Boolean)
  if (points.length <= 3) {
    return
  }

  points.pop()
  selectedProvince.value.points = points.join(' ')
  syncProvinceGeometry(selectedProvince.value)
}

function moveCenterByOffset() {
  if (!selectedProvince.value) {
    return
  }

  const offsetXValue = Number(centerOffsetX.value)
  const offsetYValue = Number(centerOffsetY.value)

  if (!Number.isFinite(offsetXValue) || !Number.isFinite(offsetYValue)) {
    return
  }

  const province = selectedProvince.value
  province.centerX = Math.round(province.centerX + offsetXValue)
  province.centerY = Math.round(province.centerY + offsetYValue)

  const points = province.points
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => {
      const [xText, yText] = entry.split(',')
      const x = Number(xText)
      const y = Number(yText)
      return `${Math.round(x + offsetXValue)},${Math.round(y + offsetYValue)}`
    })

  province.points = points.join(' ')
  centerOffsetX.value = '0'
  centerOffsetY.value = '0'
}

function setCenterFromInputs() {
  if (!selectedProvince.value) {
    return
  }

  const x = Number(selectedProvince.value.centerX)
  const y = Number(selectedProvince.value.centerY)

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return
  }

  const province = selectedProvince.value
  const currentPoints = province.points.trim().split(/\s+/).filter(Boolean)
  const centerDeltaX = x - getPolygonCentroid(province.points).x
  const centerDeltaY = y - getPolygonCentroid(province.points).y

  if (centerDeltaX === 0 && centerDeltaY === 0) {
    return
  }

  province.points = currentPoints
    .map((entry) => {
      const [pointXText, pointYText] = entry.split(',')
      const pointX = Number(pointXText)
      const pointY = Number(pointYText)
      return `${Math.round(pointX + centerDeltaX)},${Math.round(pointY + centerDeltaY)}`
    })
    .join(' ')

  syncProvinceGeometry(province)
}

function getPolygonCentroid(pointsText: string) {
  const points = pointsText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [xText, yText] = pair.split(',')
      return {
        x: Number(xText),
        y: Number(yText),
      }
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))

  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  const total = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x
      accumulator.y += point.y
      return accumulator
    },
    { x: 0, y: 0 },
  )

  return {
    x: Math.round(total.x / points.length),
    y: Math.round(total.y / points.length),
  }
}

function exportMapState() {
  const payload = provincesState.value.map((province) => ({
    id: province.id,
    name: province.name,
    owner: province.owner,
    points: province.points,
    centerX: province.centerX,
    centerY: province.centerY,
    borders: province.borders,
  }))

  const text = JSON.stringify(payload, null, 2)

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .catch(() => {
        window.alert('Mapa exportado para o console. Copie o JSON a partir do console do navegador.')
        console.log(text)
      })
    window.alert('JSON do mapa copiado para a área de transferência.')
    return
  }

  console.log(text)
  window.alert('JSON do mapa foi enviado para o console do navegador.')
}
</script>

<template>
  <main class="editor-shell">
    <section class="editor-stage">
      <div class="map-panel">
        <GameMap
          :provinces="provincesState"
          :armies="[]"
          :selected-province-id="selectedProvinceId"
          :selected-army-id="null"
          :hovered-province-id="hoveredProvinceId"
          :preview-path="[]"
          :combat-indicators="[]"
          :show-frontier-lines="showProvinceBorderLines"
          :map-view-box="mapViewBox"
          :initial-scale="1.1"
          @select-province="selectProvince"
          @hover-province="hoveredProvinceId = $event"
          @clear-selection="clearSelection"
        />
      </div>

      <aside class="editor-panel">
        <div class="panel-header">
          <p class="eyebrow">Editor de Mapa</p>
          <h2>Províncias e bordas</h2>
        </div>

        <div v-if="selectedProvince" class="province-editor">
          <div class="province-title-row">
            <strong>{{ selectedProvince.name }}</strong>
            <span>ID {{ selectedProvince.id }}</span>
          </div>

          <label class="field">
            <span>Adicionar borda por ID</span>
            <div class="inline-inputs">
              <input v-model="borderInput" type="text" placeholder="ex: 14, 18, 23" />
              <button type="button" @click="addBorder">Adicionar</button>
            </div>
          </label>

          <label class="field">
            <span>Center</span>
            <div class="inline-inputs center-grid">
              <input v-model.number="selectedProvince.centerX" type="number" placeholder="centerX" />
              <input v-model.number="selectedProvince.centerY" type="number" placeholder="centerY" />
              <button type="button" @click="setCenterFromInputs">Aplicar</button>
            </div>
          </label>

          <label class="field">
            <span>Movimentar center por offset</span>
            <div class="inline-inputs center-grid">
              <input v-model="centerOffsetX" type="number" placeholder="offset X" />
              <input v-model="centerOffsetY" type="number" placeholder="offset Y" />
              <button type="button" @click="moveCenterByOffset">Mover</button>
            </div>
          </label>

          <label class="field">
            <span>Adicionar ponto</span>
            <div class="inline-inputs">
              <input v-model="pointInput" type="text" placeholder="x,y" />
              <button type="button" @click="addPoint">Adicionar ponto</button>
            </div>
          </label>

          <div class="action-row">
            <button type="button" @click="toggleProvinceBorderLines">
              {{ showProvinceBorderLines ? 'Ocultar linha das províncias' : 'Mostrar linha das províncias' }}
            </button>
            <button type="button" class="danger" @click="removeLastPoint">Remover último ponto</button>
            <button type="button" class="primary" @click="exportMapState">Exportar JSON</button>
          </div>

          <div class="points-list">
            <h3>Points</h3>

            <div v-if="pointEntriesForProvince(selectedProvince).length > 0" class="point-list-box">
              <div v-for="point in pointEntriesForProvince(selectedProvince)" :key="point.id" class="point-item">
                <input
                  :value="point.value"
                  @input="updatePoint(point.index, ($event.target as HTMLInputElement).value)"
                  type="text"
                />
                <button type="button" class="danger small" @click="removePoint(point.index)">Remover</button>
              </div>
            </div>

            <p v-else class="empty-state">Sem points cadastrados.</p>
          </div>

          <div class="border-list">
            <h3>Bordas</h3>

            <ul v-if="selectedProvince.borders.length > 0">
              <li v-for="borderId in selectedProvince.borders" :key="borderId">
                <span>Provincia {{ borderId }}</span>
                <button type="button" @click="removeBorder(borderId)">Remover</button>
              </li>
            </ul>

            <p v-else class="empty-state">Sem bordas cadastradas.</p>
          </div>
        </div>

        <div v-else class="empty-selection">
          <p>Clique em uma província no mapa para editar bordas e pontos.</p>
        </div>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  min-height: 100vh;
  padding: 1rem;
  background: linear-gradient(160deg, #0f172a 0%, #111827 52%, #1f2937 100%);
  color: #e2e8f0;
}

.editor-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 420px);
  gap: 1rem;
  height: calc(100vh - 2rem);
}

.map-panel,
.editor-panel {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.72);
  overflow: hidden;
}

.map-panel {
  min-height: 0;
}

.editor-panel {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  min-height: 0;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.eyebrow {
  margin: 0;
  color: #93c5fd;
  font-size: 0.72rem;
  letter-spacing: 0.12rem;
  text-transform: uppercase;
  font-weight: 700;
}

h2,
h3 {
  margin: 0;
}

.province-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.province-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.province-title-row span {
  color: #93c5fd;
  font-size: 0.8rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.field span {
  font-size: 0.75rem;
  color: #cbd5e1;
  font-weight: 600;
}

.inline-inputs {
  display: flex;
  gap: 0.5rem;
}

input {
  width: 100%;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  padding: 0.6rem 0.75rem;
  font: inherit;
}

button {
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(30, 41, 59, 0.95);
  color: #e2e8f0;
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
  font: inherit;
  cursor: pointer;
}

button.primary {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(96, 165, 250, 0.7);
}

button.danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(248, 113, 113, 0.7);
}

button.small {
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
}

.action-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.center-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.points-list,
.points-list,
.border-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.point-list-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.point-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
}

.border-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.border-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.6rem;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.empty-state,
.empty-selection {
  color: #cbd5e1;
  opacity: 0.85;
}

.empty-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 0.8rem;
  padding: 1rem;
  text-align: center;
}

@media (max-width: 980px) {
  .editor-stage {
    grid-template-columns: 1fr;
    height: auto;
  }

  .map-panel {
    min-height: 440px;
  }
}
</style>
