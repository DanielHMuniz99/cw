<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface CenterPoint {
  id: number
  name: string
  x: number
  y: number
  borders: number[]
}

interface UploadImageResponse {
  fileName: string
  publicPath: string
}

interface SaveMapResponse {
  fileName: string
  message: string
}

const mapWidth = ref(2000)
const mapHeight = ref(1200)
const mapFileName = ref('new-map-centers')
const overlayImagePath = ref('')
const imageAssets = ref<string[]>([])
const points = ref<CenterPoint[]>([])
const selectedPointId = ref<number | null>(null)
const feedbackMessage = ref('')
const isSaving = ref(false)
const isUploading = ref(false)
const pointSpacing = ref(50)

const selectedPoint = computed(() => {
  if (selectedPointId.value === null) {
    return null
  }

  return points.value.find((point) => point.id === selectedPointId.value) ?? null
})

const nearbyPoints = computed(() => {
  if (!selectedPoint.value) {
    return []
  }

  const range = 50

  return points.value.filter((point) => {
    if (point.id === selectedPointId.value) {
      return false
    }

    const dx = point.x - selectedPoint.value.x
    const dy = point.y - selectedPoint.value.y

    const distance = Math.sqrt(dx * dx + dy * dy)

    return distance <= range
  })
})

const boardStyle = computed(() => ({
  width: `${mapWidth.value}px`,
  height: `${mapHeight.value}px`,
}))

const borderSegments = computed(() => {
  const index = new Map(points.value.map((point) => [point.id, point]))
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
  const seen = new Set<string>()

  for (const point of points.value) {
    for (const borderId of point.borders) {
      const neighbor = index.get(borderId)
      if (!neighbor) {
        continue
      }

      const minId = Math.min(point.id, neighbor.id)
      const maxId = Math.max(point.id, neighbor.id)
      const key = `${minId}-${maxId}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      segments.push({
        key,
        x1: point.x,
        y1: point.y,
        x2: neighbor.x,
        y2: neighbor.y,
      })
    }
  }

  return segments
})

function sanitizeFileName(rawName: string) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function clampDimensions() {
  mapWidth.value = Math.max(200, Math.min(12000, Math.round(mapWidth.value || 0)))
  mapHeight.value = Math.max(200, Math.min(12000, Math.round(mapHeight.value || 0)))
}

function selectPoint(pointId: number) {
  selectedPointId.value = pointId
}

function clearSelection() {
  selectedPointId.value = null
}

function getNextPointId() {
  return points.value.reduce((maxId, point) => Math.max(maxId, point.id), 0) + 1
}

function createPointFromClick(event: MouseEvent) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  const rect = event.currentTarget.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top

  if (
    offsetX < 0 ||
    offsetY < 0 ||
    offsetX > rect.width ||
    offsetY > rect.height
  ) {
    return
  }

  const centerX = Math.round((offsetX / rect.width) * mapWidth.value)
  const centerY = Math.round((offsetY / rect.height) * mapHeight.value)

  const spacing = pointSpacing.value

  const positions = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0], [0,  0], [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ]

  for (const [dx, dy] of positions) {
    const x = centerX + dx * spacing
    const y = centerY + dy * spacing

    // Não cria pontos fora do mapa
    if (
      x < 0 ||
      y < 0 ||
      x > mapWidth.value ||
      y > mapHeight.value
    ) {
      continue
    }

    const id = getNextPointId()

    points.value.push({
      id,
      name: `Point ${id}`,
      x,
      y,
      borders: [],
    })
  }

  feedbackMessage.value = `9 pontos criados ao redor de (${centerX}, ${centerY}).`
}

function removePoint(pointId: number) {
  points.value = points.value
    .filter((point) => point.id !== pointId)
    .map((point) => ({
      ...point,
      borders: point.borders.filter((id) => id !== pointId),
    }))

  if (selectedPointId.value === pointId) {
    selectedPointId.value = null
  }
}

function syncBorders(pointId: number, neighborId: number, enabled: boolean) {
  const point = points.value.find((item) => item.id === pointId)
  const neighbor = points.value.find((item) => item.id === neighborId)

  if (!point || !neighbor || point.id === neighbor.id) {
    return
  }

  if (enabled) {
    if (!point.borders.includes(neighbor.id)) {
      point.borders.push(neighbor.id)
    }

    if (!neighbor.borders.includes(point.id)) {
      neighbor.borders.push(point.id)
    }

    point.borders.sort((a, b) => a - b)
    neighbor.borders.sort((a, b) => a - b)
    return
  }

  point.borders = point.borders.filter((id) => id !== neighbor.id)
  neighbor.borders = neighbor.borders.filter((id) => id !== point.id)
}

function toggleBorder(neighborId: number) {
  if (!selectedPoint.value) {
    return
  }

  const hasBorder = selectedPoint.value.borders.includes(neighborId)
  syncBorders(selectedPoint.value.id, neighborId, !hasBorder)
}

async function refreshImageAssets() {
  try {
    const response = await fetch('/api/map-centers/assets')
    if (!response.ok) {
      return
    }

    imageAssets.value = await response.json()
  } catch {
    imageAssets.value = []
  }
}

async function uploadOverlayImage(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''

  if (!file) {
    return
  }

  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'png' && extension !== 'bmp') {
    feedbackMessage.value = 'Formato invalido. Use apenas PNG ou BMP.'
    return
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(file)
  })

  isUploading.value = true

  try {
    const response = await fetch('/api/map-centers/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        dataUrl,
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Falha ao enviar imagem')
    }

    const payload = (await response.json()) as UploadImageResponse
    overlayImagePath.value = payload.publicPath
    feedbackMessage.value = `Imagem ${payload.fileName} salva em public/maps.`
    await refreshImageAssets()
  } catch (error) {
    feedbackMessage.value = error instanceof Error ? error.message : 'Falha ao enviar imagem.'
  } finally {
    isUploading.value = false
  }
}

function handleImageAssetSelection(event: Event) {
  const select = event.target as HTMLSelectElement
  const selected = select.value

  if (!selected) {
    overlayImagePath.value = ''
    return
  }

  overlayImagePath.value = `/maps/${selected}`
}

async function saveMapJson() {
  clampDimensions()

  const fileBase = sanitizeFileName(mapFileName.value)
  if (!fileBase) {
    feedbackMessage.value = 'Informe um nome valido para o arquivo do mapa.'
    return
  }

  if (points.value.length === 0) {
    feedbackMessage.value = 'Crie pelo menos um ponto antes de salvar.'
    return
  }

  isSaving.value = true

  try {
    const response = await fetch('/api/map-centers/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: `${fileBase}.json`,
        map: {
          width: mapWidth.value,
          height: mapHeight.value,
          overlayImage: overlayImagePath.value ? overlayImagePath.value.replace('/maps/', '') : null,
          points: points.value.map((point) => ({
            id: point.id,
            name: point.name.trim() || `Point ${point.id}`,
            x: Math.round(point.x),
            y: Math.round(point.y),
            borders: [...new Set(point.borders)].sort((a, b) => a - b),
          })),
        },
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Falha ao salvar JSON do mapa')
    }

    const payload = (await response.json()) as SaveMapResponse
    feedbackMessage.value = payload.message
  } catch (error) {
    feedbackMessage.value = error instanceof Error ? error.message : 'Falha ao salvar mapa.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  refreshImageAssets()
})
</script>

<template>
  <main class="creator-shell">
    <section class="creator-layout">
      <aside class="tools-panel">
        <h2>Criar Mapa por Centros</h2>

        <label class="field">
          <span>Largura do mapa (horizontal)</span>
          <input v-model.number="mapWidth" type="number" min="200" max="12000" @change="clampDimensions" />
        </label>

        <label class="field">
          <span>Altura do mapa (vertical)</span>
          <input v-model.number="mapHeight" type="number" min="200" max="12000" @change="clampDimensions" />
        </label>

        <label class="field">
          <span>Selecionar imagem em public/maps</span>
          <select @change="handleImageAssetSelection">
            <option value="">Sem imagem</option>
            <option v-for="asset in imageAssets" :key="asset" :value="asset">{{ asset }}</option>
          </select>
        </label>

        <label class="field">
          <span>Upload de PNG ou BMP para public/maps</span>
          <input type="file" accept=".png,.bmp,image/png,image/bmp" @change="uploadOverlayImage" />
        </label>

        <label class="field">
          <span>Nome do JSON (public/json/maps)</span>
          <input v-model="mapFileName" type="text" placeholder="new-map-centers" />
        </label>

        <button type="button" :disabled="isSaving" class="primary" @click="saveMapJson">
          {{ isSaving ? 'Salvando...' : 'Salvar Mapa JSON' }}
        </button>

        <p v-if="feedbackMessage" class="feedback">{{ feedbackMessage }}</p>

        <label class="field">
        <span>Distância entre pontos</span>
        <input
            v-model.number="pointSpacing"
            type="number"
            min="1"
            max="500"
        />
        </label>

        <div v-if="selectedPoint" class="editor-card">
          <h3>Ponto selecionado: {{ selectedPoint.id }}</h3>

          <label class="field">
            <span>Nome</span>
            <input v-model="selectedPoint.name" type="text" />
          </label>

          <label class="field">
            <span>X</span>
            <input v-model.number="selectedPoint.x" type="number" />
          </label>

          <label class="field">
            <span>Y</span>
            <input v-model.number="selectedPoint.y" type="number" />
          </label>

          <div class="field">
            <span>Bordas</span>
            <div class="borders-list">
  <label
    v-for="point in nearbyPoints"
    :key="point.id"
    class="border-option"
  >
    <input
      type="checkbox"
      :checked="selectedPoint.borders.includes(point.id)"
      @change="toggleBorder(point.id)"
    />
    <span>{{ point.id }} - {{ point.name }}</span>
  </label>
</div>
          </div>

          <div class="actions-row">
            <button type="button" @click="clearSelection">Desselecionar</button>
            <button type="button" class="danger" @click="removePoint(selectedPoint.id)">Remover ponto</button>
          </div>
        </div>
      </aside>

      <section class="board-panel">
        <p class="hint">Clique na area para criar pontos. A imagem fica em 50% de transparencia apenas como referencia visual.</p>

        <div class="board-scroll">
          <div class="map-board" :style="boardStyle" @click="createPointFromClick">
            <img
              v-if="overlayImagePath"
              :src="overlayImagePath"
              alt="Referencia de mapa"
              class="overlay-image"
              draggable="false"
            />

            <svg class="overlay-svg" :viewBox="`0 0 ${mapWidth} ${mapHeight}`" preserveAspectRatio="none">
              <line
                v-for="segment in borderSegments"
                :key="segment.key"
                :x1="segment.x1"
                :y1="segment.y1"
                :x2="segment.x2"
                :y2="segment.y2"
                class="border-line"
              />

              <g
                v-for="point in points"
                :key="point.id"
                class="point-group"
                @click.stop="selectPoint(point.id)"
              >
                <circle
                  :cx="point.x"
                  :cy="point.y"
                  :r="selectedPointId === point.id ? 11 : 8"
                  :class="selectedPointId === point.id ? 'point-dot selected' : 'point-dot'"
                />
              </g>
            </svg>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.creator-shell {
  min-height: 100vh;
  padding: 1rem;
  background: linear-gradient(165deg, #0b1220 0%, #1d2a43 48%, #22334f 100%);
  color: #e6edf8;
}

.creator-layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 1rem;
  height: calc(100vh - 2rem);
}

.tools-panel,
.board-panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.9rem;
  background: rgba(8, 15, 30, 0.85);
}

.tools-panel {
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

h2,
h3 {
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field span {
  font-size: 0.8rem;
  color: #bfdbfe;
  font-weight: 600;
}

input,
select,
button {
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.8);
  color: #f8fafc;
  padding: 0.55rem 0.65rem;
  font: inherit;
}

button {
  cursor: pointer;
}

button.primary {
  background: rgba(14, 116, 144, 0.45);
  border-color: rgba(34, 211, 238, 0.7);
}

button.danger {
  background: rgba(185, 28, 28, 0.38);
  border-color: rgba(248, 113, 113, 0.7);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.feedback {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  background: rgba(37, 99, 235, 0.18);
  color: #dbeafe;
  font-size: 0.85rem;
}

.editor-card {
  margin-top: 0.3rem;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.borders-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 220px;
  overflow: auto;
  padding: 0.4rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.45rem;
  background: rgba(15, 23, 42, 0.6);
}

.border-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.84rem;
}

.actions-row {
  display: flex;
  gap: 0.5rem;
}

.board-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.75rem;
}

.hint {
  margin: 0 0 0.65rem;
  color: #bfdbfe;
  font-size: 0.86rem;
}

.board-scroll {
  overflow: auto;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background:
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px) 0 0 / 40px 40px,
    #07101e;
}

.map-board {
  position: relative;
  background: rgba(2, 6, 23, 0.65);
}

.overlay-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  opacity: 0.5;
  pointer-events: none;
}

.overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.border-line {
  stroke: rgba(234, 179, 8, 0.95);
  stroke-width: 2;
}

.point-dot {
  fill: #38bdf8;
  stroke: rgba(3, 7, 18, 0.9);
  stroke-width: 2;
  cursor: pointer;
}

.point-dot.selected {
  fill: #facc15;
}

@media (max-width: 1100px) {
  .creator-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .board-panel {
    min-height: 520px;
  }
}
</style>
