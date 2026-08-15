<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { normalizeMapJson } from '../utils/mapData'

interface VisualVertex {
  x: number
  y: number
}

interface VisualProvince {
  id: number
  name: string
  countryId: number | null
  centerId: number | null
  vertices: VisualVertex[]
}

interface SaveMapResponse {
  fileName: string
  message: string
}

const mapWidth = ref(2000)
const mapHeight = ref(1200)
const zoom = ref(1)
const mapFileName = ref('new-visual-map')
const overlayImagePath = ref('')
const imageAssets = ref<string[]>([])
const centerJsonAssets = ref<string[]>([])
const visualJsonAssets = ref<string[]>([])
const centerReferenceMap = ref<{ points: Array<{ id: number; x: number; y: number; borders: number[] }> } | null>(null)
const centerReferenceFile = ref('')
const feedbackMessage = ref('')
const isSaving = ref(false)
const saveMode = ref<'new' | 'update'>('new')
const saveTargetFile = ref('')

const provinces = ref<VisualProvince[]>([])
const draftVertices = ref<VisualVertex[]>([])
const newProvinceName = ref('')
const newProvinceCountryId = ref<number | null>(null)
const selectedProvinceId = ref<number | null>(null)
const hoverPosition = ref<VisualVertex | null>(null)
const snapTarget = ref<VisualVertex | null>(null)

const closeTolerancePx = ref(18)
const snapTolerancePx = ref(14)
const moveDeltaX = ref(0)
const moveDeltaY = ref(0)

const boardStyle = computed(() => ({
  width: `${Math.round(mapWidth.value * zoom.value)}px`,
  height: `${Math.round(mapHeight.value * zoom.value)}px`,
}))

const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`)

const selectedProvince = computed(() => {
  if (selectedProvinceId.value === null) {
    return null
  }

  return provinces.value.find((province) => province.id === selectedProvinceId.value) ?? null
})

const draftClosedPreview = computed(() => {
  if (draftVertices.value.length < 3) {
    return ''
  }

  const points = [...draftVertices.value, draftVertices.value[0]]
  return points.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')
})

const draftLinePreview = computed(() => {
  if (!draftVertices.value.length) {
    return ''
  }

  return draftVertices.value.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')
})

const centerReferenceSegments = computed(() => {
  if (!centerReferenceMap.value) {
    return []
  }

  const points = centerReferenceMap.value.points
  const pointIndex = new Map(points.map((point) => [point.id, point]))
  const seen = new Set<string>()
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []

  for (const point of points) {
    for (const neighborId of point.borders) {
      const neighbor = pointIndex.get(neighborId)
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

const allExistingVertices = computed(() => {
  return provinces.value.flatMap((province) => province.vertices)
})

function clampDimensions() {
  mapWidth.value = Math.max(200, Math.min(120000, Math.round(mapWidth.value || 0)))
  mapHeight.value = Math.max(200, Math.min(120000, Math.round(mapHeight.value || 0)))
}

function setZoom(nextZoom: number) {
  zoom.value = Math.min(4, Math.max(0.2, Number(nextZoom) || 1))
}

function zoomIn() {
  setZoom(zoom.value * 1.2)
}

function zoomOut() {
  setZoom(zoom.value / 1.2)
}

function sanitizeFileName(rawName: string) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getNextProvinceId() {
  return provinces.value.reduce((maxId, province) => Math.max(maxId, province.id), 0) + 1
}

function getMapCoordinatesFromEvent(event: MouseEvent) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return null
  }

  const rect = event.currentTarget.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top

  if (offsetX < 0 || offsetY < 0 || offsetX > rect.width || offsetY > rect.height) {
    return null
  }

  return {
    x: Math.round((offsetX / rect.width) * mapWidth.value),
    y: Math.round((offsetY / rect.height) * mapHeight.value),
  }
}

function clampVertex(vertex: VisualVertex) {
  return {
    x: Math.max(0, Math.min(mapWidth.value, Math.round(vertex.x))),
    y: Math.max(0, Math.min(mapHeight.value, Math.round(vertex.y))),
  }
}

function findNearestExistingVertex(candidate: VisualVertex) {
  let nearest: VisualVertex | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const vertex of allExistingVertices.value) {
    const dx = candidate.x - vertex.x
    const dy = candidate.y - vertex.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = vertex
    }
  }

  if (!nearest || nearestDistance > Math.max(4, snapTolerancePx.value)) {
    return null
  }

  return { ...nearest }
}

function isNearFirstVertex(candidate: VisualVertex) {
  if (!draftVertices.value.length) {
    return false
  }

  const first = draftVertices.value[0]
  const dx = candidate.x - first.x
  const dy = candidate.y - first.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  return distance <= Math.max(4, closeTolerancePx.value)
}

function isPointInsidePolygon(point: VisualVertex, polygon: VisualVertex[]) {
  let isInside = false

  for (let leftIndex = 0, rightIndex = polygon.length - 1; leftIndex < polygon.length; rightIndex = leftIndex++) {
    const left = polygon[leftIndex]
    const right = polygon[rightIndex]
    const intersects = ((left.y > point.y) !== (right.y > point.y))
      && (point.x < ((right.x - left.x) * (point.y - left.y)) / ((right.y - left.y) || 1e-9) + left.x)

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}

function findCenterIdInsideProvince(vertices: VisualVertex[]) {
  const centers = centerReferenceMap.value?.points ?? []
  if (!centers.length || vertices.length < 3) {
    return null
  }

  const insideCenters = centers.filter((centerPoint) => isPointInsidePolygon({ x: centerPoint.x, y: centerPoint.y }, vertices))

  if (insideCenters.length === 0) {
    return null
  }

  const centroid = vertices.reduce(
    (accumulator, vertex) => ({
      x: accumulator.x + vertex.x,
      y: accumulator.y + vertex.y,
    }),
    { x: 0, y: 0 },
  )

  const centerX = centroid.x / vertices.length
  const centerY = centroid.y / vertices.length

  insideCenters.sort((left, right) => {
    const leftDistance = Math.hypot(left.x - centerX, left.y - centerY)
    const rightDistance = Math.hypot(right.x - centerX, right.y - centerY)
    return leftDistance - rightDistance
  })

  return insideCenters[0]?.id ?? null
}

function closeDraftProvince() {
  if (draftVertices.value.length < 3) {
    feedbackMessage.value = 'Uma província precisa de no mínimo 3 pontos.'
    return
  }

  const id = getNextProvinceId()
  const name = newProvinceName.value.trim() || `Província ${id}`
  const normalizedVertices = draftVertices.value.map((vertex) => clampVertex({ ...vertex }))
  const centerId = findCenterIdInsideProvince(normalizedVertices)

  provinces.value.push({
    id,
    name,
    countryId: newProvinceCountryId.value,
    centerId,
    vertices: normalizedVertices,
  })

  draftVertices.value = []
  newProvinceName.value = ''
  selectedProvinceId.value = id
  feedbackMessage.value = centerId === null
    ? `Província ${name} criada com ${provinces.value[provinces.value.length - 1].vertices.length} pontos (sem centro detectado).`
    : `Província ${name} criada com ${provinces.value[provinces.value.length - 1].vertices.length} pontos (center_id ${centerId}).`
}

function handleBoardClick(event: MouseEvent) {
  const position = getMapCoordinatesFromEvent(event)
  if (!position) {
    return
  }

  const snappedPosition = snapTarget.value ? { ...snapTarget.value } : position

  if (draftVertices.value.length >= 3 && isNearFirstVertex(snappedPosition)) {
    closeDraftProvince()
    return
  }

  draftVertices.value = [...draftVertices.value, clampVertex(snappedPosition)]
}

function handleBoardMouseMove(event: MouseEvent) {
  const position = getMapCoordinatesFromEvent(event)
  hoverPosition.value = position

  if (!position) {
    snapTarget.value = null
    return
  }

  snapTarget.value = findNearestExistingVertex(position)
}

function handleBoardMouseLeave() {
  hoverPosition.value = null
  snapTarget.value = null
}

function undoDraftVertex() {
  if (!draftVertices.value.length) {
    return
  }

  draftVertices.value = draftVertices.value.slice(0, -1)
}

function clearDraft() {
  draftVertices.value = []
}

function removeProvince(provinceId: number) {
  provinces.value = provinces.value.filter((province) => province.id !== provinceId)

  if (selectedProvinceId.value === provinceId) {
    selectedProvinceId.value = null
  }
}

function selectProvince(provinceId: number) {
  selectedProvinceId.value = provinceId
}

function nudgeSelectedProvinceByInput() {
  if (!selectedProvince.value) {
    return
  }

  const deltaX = Number(moveDeltaX.value) || 0
  const deltaY = Number(moveDeltaY.value) || 0

  selectedProvince.value.vertices = selectedProvince.value.vertices.map((vertex) => clampVertex({
    x: vertex.x + deltaX,
    y: vertex.y + deltaY,
  }))

  feedbackMessage.value = `Província ${selectedProvince.value.name} movida por (${deltaX}, ${deltaY}).`
}

function updateSelectedVertex(index: number, axis: 'x' | 'y', value: string) {
  if (!selectedProvince.value) {
    return
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return
  }

  const current = selectedProvince.value.vertices[index]
  if (!current) {
    return
  }

  const next = clampVertex({
    x: axis === 'x' ? parsed : current.x,
    y: axis === 'y' ? parsed : current.y,
  })

  selectedProvince.value.vertices[index] = next
}

function updateSelectedCenterId(value: string) {
  if (!selectedProvince.value) {
    return
  }

  const trimmed = value.trim()
  if (!trimmed) {
    selectedProvince.value.centerId = null
    return
  }

  const parsed = Number(trimmed)
  selectedProvince.value.centerId = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function removeSelectedVertex(index: number) {
  if (!selectedProvince.value) {
    return
  }

  if (selectedProvince.value.vertices.length <= 3) {
    feedbackMessage.value = 'A província precisa manter pelo menos 3 pontos.'
    return
  }

  selectedProvince.value.vertices = selectedProvince.value.vertices.filter((_, vertexIndex) => vertexIndex !== index)
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

async function refreshCenterJsonAssets() {
  try {
    const response = await fetch('/api/map-centers/json-assets?scope=centers')
    if (!response.ok) {
      centerJsonAssets.value = []
      return
    }

    centerJsonAssets.value = await response.json()
  } catch {
    centerJsonAssets.value = []
  }
}

async function refreshVisualJsonAssets() {
  try {
    const response = await fetch('/api/map-centers/json-assets?scope=visual')
    if (!response.ok) {
      visualJsonAssets.value = []
      return
    }

    visualJsonAssets.value = await response.json()
  } catch {
    visualJsonAssets.value = []
  }
}

async function handleCenterMapSelection(event: Event) {
  const select = event.target as HTMLSelectElement
  const selected = select.value

  await loadCenterReferenceByFile(selected)
}

async function loadCenterReferenceByFile(selected: string) {
  centerReferenceFile.value = selected

  if (!selected) {
    centerReferenceMap.value = null
    return
  }

  try {
    const response = await fetch(`/json/maps/centers/${encodeURIComponent(selected)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const normalized = normalizeMapJson(await response.json())
    const points = (normalized.points ?? []).map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      borders: [...(point.borders ?? [])],
    }))

    centerReferenceMap.value = { points }
    feedbackMessage.value = `Mapa de centros "${selected}" carregado para referência.`
  } catch {
    centerReferenceMap.value = null
    centerReferenceFile.value = ''
    feedbackMessage.value = `Falha ao carregar referência de centros "${selected}".`
  }
}

async function handleVisualUpdateSelection(event: Event) {
  const select = event.target as HTMLSelectElement
  const selected = select.value

  saveTargetFile.value = selected

  if (!selected) {
    return
  }

  try {
    const response = await fetch(`/json/maps/visual/${encodeURIComponent(selected)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json() as {
      width?: number
      height?: number
      overlayImage?: string | null
      centers?: string | null
      provinces?: Array<{
        id?: number
        name?: string
        country_id?: number | null
        center_id?: number | null
        vertices?: Array<{ x?: number; y?: number }>
      }>
    }

    mapWidth.value = Number(payload.width ?? mapWidth.value)
    mapHeight.value = Number(payload.height ?? mapHeight.value)
    overlayImagePath.value = payload.overlayImage ? `/maps/${payload.overlayImage}` : ''
    mapFileName.value = selected.replace(/\.json$/i, '')

    provinces.value = Array.isArray(payload.provinces)
      ? payload.provinces.map((province, index) => ({
          id: Number(province.id ?? index + 1),
          name: String(province.name ?? `Província ${index + 1}`),
          countryId: province.country_id === null || province.country_id === undefined ? null : Number(province.country_id),
          centerId: province.center_id === null || province.center_id === undefined ? null : Number(province.center_id),
          vertices: Array.isArray(province.vertices)
            ? province.vertices
                .map((vertex) => ({
                  x: Number(vertex.x ?? 0),
                  y: Number(vertex.y ?? 0),
                }))
                .filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))
            : [],
        }))
      : []

    selectedProvinceId.value = null
    draftVertices.value = []

    const centersFile = typeof payload.centers === 'string' ? payload.centers : ''
    await loadCenterReferenceByFile(centersFile)

    feedbackMessage.value = `Mapa visual "${selected}" carregado para edição.`
  } catch {
    feedbackMessage.value = `Falha ao carregar o mapa visual "${selected}".`
  }
}

async function refreshImageAssets() {
  try {
    const response = await fetch('/api/map-centers/assets')
    if (!response.ok) {
      imageAssets.value = []
      return
    }

    imageAssets.value = await response.json()
  } catch {
    imageAssets.value = []
  }
}

async function saveVisualMapJson() {
  clampDimensions()

  const isUpdateMode = saveMode.value === 'update'
  const fileBase = sanitizeFileName(mapFileName.value)
  let fileName = ''

  if (isUpdateMode) {
    if (!saveTargetFile.value) {
      feedbackMessage.value = 'Selecione um arquivo existente para atualizar.'
      return
    }

    fileName = saveTargetFile.value
  } else {
    if (!fileBase) {
      feedbackMessage.value = 'Informe um nome válido para o arquivo.'
      return
    }

    fileName = `${fileBase}.json`
  }

  if (!provinces.value.length) {
    feedbackMessage.value = 'Crie pelo menos uma província antes de salvar.'
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
        fileName,
        scope: 'visual',
        overwriteExisting: isUpdateMode,
        map: {
          width: mapWidth.value,
          height: mapHeight.value,
          overlayImage: overlayImagePath.value ? overlayImagePath.value.replace('/maps/', '') : null,
          centers: centerReferenceFile.value || null,
          type: 'visual-province-map',
          provinces: provinces.value.map((province) => ({
            id: province.id,
            name: province.name.trim() || `Província ${province.id}`,
            country_id: province.countryId,
            center_id: province.centerId,
            vertices: province.vertices.map((vertex) => ({
              x: Math.round(vertex.x),
              y: Math.round(vertex.y),
            })),
          })),
        },
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Falha ao salvar JSON visual')
    }

    const payload = (await response.json()) as SaveMapResponse
    feedbackMessage.value = payload.message
    await refreshVisualJsonAssets()
  } catch (error) {
    feedbackMessage.value = error instanceof Error ? error.message : 'Falha ao salvar mapa visual.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  refreshImageAssets()
  refreshCenterJsonAssets()
  refreshVisualJsonAssets()
})
</script>

<template>
  <main class="visual-creator-shell">
    <section class="visual-creator-layout">
      <aside class="tools-panel">
        <h2>Criar Mapa Visual</h2>

        <label class="field">
          <span>Largura da tela</span>
          <input v-model.number="mapWidth" type="number" min="200" max="120000" @change="clampDimensions" />
        </label>

        <label class="field">
          <span>Altura da tela</span>
          <input v-model.number="mapHeight" type="number" min="200" max="120000" @change="clampDimensions" />
        </label>

        <div class="field">
          <span>Zoom do mapa</span>
          <div class="actions-row zoom-row">
            <button type="button" @click="zoomOut">-</button>
            <span class="zoom-value">{{ zoomPercent }}</span>
            <button type="button" @click="zoomIn">+</button>
          </div>
        </div>

        <label class="field">
          <span>Imagem base em /maps (PNG/BMP)</span>
          <select @change="handleImageAssetSelection">
            <option value="">Sem imagem</option>
            <option v-for="asset in imageAssets" :key="asset" :value="asset">{{ asset }}</option>
          </select>
        </label>

        <label class="field">
          <span>Referência de centros em /json/maps</span>
          <select v-model="centerReferenceFile" @change="handleCenterMapSelection">
            <option value="">Sem referência</option>
            <option v-for="asset in centerJsonAssets" :key="asset" :value="asset">{{ asset }}</option>
          </select>
        </label>

        <label class="field">
          <span>Nome do JSON final (public/json/maps/visual)</span>
          <input v-model="mapFileName" type="text" placeholder="new-visual-map" />
        </label>

        <label class="field">
          <span>Modo de salvamento</span>
          <select v-model="saveMode">
            <option value="new">Criar novo arquivo</option>
            <option value="update">Atualizar arquivo existente</option>
          </select>
        </label>

        <label v-if="saveMode === 'update'" class="field">
          <span>Arquivo existente para atualizar</span>
          <select v-model="saveTargetFile" @change="handleVisualUpdateSelection">
            <option value="">Selecione um arquivo</option>
            <option v-for="asset in visualJsonAssets" :key="`update-visual-${asset}`" :value="asset">{{ asset }}</option>
          </select>
        </label>

        <label class="field">
          <span>Nome da província em criação</span>
          <input v-model="newProvinceName" type="text" placeholder="Província A" />
        </label>

        <label class="field">
          <span>ID do país da província em criação</span>
          <input v-model.number="newProvinceCountryId" type="number" min="1" placeholder="Ex: 1" />
        </label>

        <label class="field">
          <span>Tolerância para fechar forma (px do editor)</span>
          <input v-model.number="closeTolerancePx" type="number" min="4" max="60" />
        </label>

        <label class="field">
          <span>Tolerância de snap entre pontos (px do editor)</span>
          <input v-model.number="snapTolerancePx" type="number" min="4" max="60" />
        </label>

        <div class="actions-row">
          <button type="button" @click="undoDraftVertex" :disabled="draftVertices.length === 0">Desfazer ponto</button>
          <button type="button" @click="clearDraft" :disabled="draftVertices.length === 0">Limpar forma</button>
        </div>

        <button type="button" class="primary" @click="closeDraftProvince" :disabled="draftVertices.length < 3">
          Fechar província
        </button>

        <button type="button" class="primary" :disabled="isSaving" @click="saveVisualMapJson">
          {{ isSaving ? 'Salvando...' : 'Salvar JSON visual' }}
        </button>

        <p class="hint">
          Clique no mapa para criar os pontos da província. Para fechar, clique perto do primeiro ponto ou use "Fechar província".
        </p>

        <p v-if="feedbackMessage" class="feedback">{{ feedbackMessage }}</p>

        <div class="province-list-card">
          <h3>Províncias</h3>

          <ul v-if="provinces.length" class="province-list">
            <li
              v-for="province in provinces"
              :key="province.id"
              :class="['province-item', selectedProvinceId === province.id ? 'active' : '']"
              @click="selectProvince(province.id)"
            >
              <div class="province-title-row">
                <strong>{{ province.name }}</strong>
                <button type="button" class="danger" @click.stop="removeProvince(province.id)">Remover</button>
              </div>
              <small>ID {{ province.id }} | País {{ province.countryId ?? 'null' }} | Centro {{ province.centerId ?? 'null' }} | {{ province.vertices.length }} pontos</small>
            </li>
          </ul>

          <p v-else class="hint">Nenhuma província criada ainda.</p>

          <p v-if="selectedProvince" class="selected-info">
            Selecionada: {{ selectedProvince.name }} ({{ selectedProvince.vertices.length }} pontos)
          </p>

          <div v-if="selectedProvince" class="selected-editor">
            <h3>Editar Província</h3>

            <label class="field">
              <span>Nome</span>
              <input v-model="selectedProvince.name" type="text" />
            </label>

            <label class="field">
              <span>ID do país</span>
              <input v-model.number="selectedProvince.countryId" type="number" min="1" placeholder="Ex: 1" />
            </label>

            <label class="field">
              <span>center_id (manual)</span>
              <input
                :value="selectedProvince.centerId ?? ''"
                type="number"
                min="1"
                placeholder="Ex: 112 (ou vazio)"
                @input="updateSelectedCenterId(($event.target as HTMLInputElement).value)"
              />
            </label>

            <div class="field">
              <span>Mover por valor (sem mouse)</span>
              <div class="actions-row">
                <input v-model.number="moveDeltaX" type="number" placeholder="Delta X" />
                <input v-model.number="moveDeltaY" type="number" placeholder="Delta Y" />
              </div>
              <button type="button" @click="nudgeSelectedProvinceByInput">Mover província</button>
            </div>

            <div class="field">
              <span>Vertices da província</span>
              <div class="vertices-list">
                <div v-for="(vertex, index) in selectedProvince.vertices" :key="`vertex-${selectedProvince.id}-${index}`" class="vertex-row">
                  <span>#{{ index + 1 }}</span>
                  <input :value="vertex.x" type="number" @input="updateSelectedVertex(index, 'x', ($event.target as HTMLInputElement).value)" />
                  <input :value="vertex.y" type="number" @input="updateSelectedVertex(index, 'y', ($event.target as HTMLInputElement).value)" />
                  <button type="button" class="danger" @click="removeSelectedVertex(index)">X</button>
                </div>
              </div>
            </div>

            <button type="button" class="danger" @click="removeProvince(selectedProvince.id)">Deletar província inteira</button>
          </div>
        </div>
      </aside>

      <section class="board-panel">
        <div class="board-scroll">
          <div class="map-board" :style="boardStyle" @click="handleBoardClick" @mousemove="handleBoardMouseMove" @mouseleave="handleBoardMouseLeave">
            <img
              v-if="overlayImagePath"
              :src="overlayImagePath"
              alt="Imagem de referência do mapa"
              class="overlay-image"
              draggable="false"
            />

            <svg class="overlay-svg" :viewBox="`0 0 ${mapWidth} ${mapHeight}`" preserveAspectRatio="none">
              <g v-if="centerReferenceMap" class="center-reference-layer">
                <line
                  v-for="segment in centerReferenceSegments"
                  :key="segment.key"
                  :x1="segment.x1"
                  :y1="segment.y1"
                  :x2="segment.x2"
                  :y2="segment.y2"
                  class="center-reference-line"
                />

                <circle
                  v-for="point in centerReferenceMap.points"
                  :key="`center-reference-${point.id}`"
                  :cx="point.x"
                  :cy="point.y"
                  r="3.2"
                  class="center-reference-point"
                />
              </g>

              <g class="province-layer">
                <polygon
                  v-for="province in provinces"
                  :key="province.id"
                  :points="province.vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')"
                  :class="selectedProvinceId === province.id ? 'province-shape selected' : 'province-shape'"
                />
              </g>

              <g class="draft-layer">
                <polyline v-if="draftLinePreview" :points="draftLinePreview" class="draft-line" />
                <polygon v-if="draftClosedPreview" :points="draftClosedPreview" class="draft-preview-shape" />

                <circle
                  v-for="(vertex, index) in allExistingVertices"
                  :key="`existing-${index}-${vertex.x}-${vertex.y}`"
                  :cx="vertex.x"
                  :cy="vertex.y"
                  r="2.4"
                  class="existing-point"
                />

                <circle
                  v-if="snapTarget"
                  :cx="snapTarget.x"
                  :cy="snapTarget.y"
                  :r="Math.max(2.5, snapTolerancePx * 0.375)"
                  class="snap-target"
                />

                <circle
                  v-if="hoverPosition"
                  :cx="hoverPosition.x"
                  :cy="hoverPosition.y"
                  r="2"
                  class="cursor-point"
                />

                <circle
                  v-for="(vertex, index) in draftVertices"
                  :key="`draft-${index}`"
                  :cx="vertex.x"
                  :cy="vertex.y"
                  :r="index === 0 ? 6 : 4"
                  :class="index === 0 ? 'draft-point first' : 'draft-point'"
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
.visual-creator-shell {
  min-height: 100vh;
  padding: 1rem;
  background: linear-gradient(165deg, #0b1220 0%, #1d2a43 48%, #22334f 100%);
  color: #e6edf8;
}

.visual-creator-layout {
  display: grid;
  grid-template-columns: minmax(320px, 430px) minmax(0, 1fr);
  gap: 1rem;
  height: calc(100vh - 2rem);
}

.tools-panel,
.board-panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.9rem;
  background: rgba(8, 15, 30, 0.86);
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

.actions-row {
  display: flex;
  gap: 0.5rem;
}

.zoom-row {
  align-items: center;
}

.zoom-value {
  min-width: 4.5rem;
  text-align: center;
  color: #dbeafe;
  font-weight: 700;
}

.hint {
  margin: 0;
  color: #bfdbfe;
  font-size: 0.84rem;
}

.feedback {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  background: rgba(37, 99, 235, 0.18);
  color: #dbeafe;
  font-size: 0.85rem;
}

.province-list-card {
  margin-top: 0.35rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
}

.province-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.province-item {
  padding: 0.45rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.65);
  cursor: pointer;
}

.province-item.active {
  border-color: rgba(34, 211, 238, 0.75);
  background: rgba(14, 116, 144, 0.2);
}

.province-title-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.selected-info {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: #dbeafe;
}

.selected-editor {
  margin-top: 0.7rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(148, 163, 184, 0.26);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.vertices-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 220px;
  overflow: auto;
  padding: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.45rem;
  background: rgba(15, 23, 42, 0.6);
}

.vertex-row {
  display: grid;
  grid-template-columns: 32px 1fr 1fr 48px;
  gap: 0.35rem;
  align-items: center;
}

.vertex-row span {
  color: #bfdbfe;
  font-size: 0.78rem;
}

.board-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.75rem;
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
  opacity: 0.35;
  pointer-events: none;
}

.overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.center-reference-layer {
  pointer-events: none;
}

.center-reference-line {
  stroke: rgba(148, 163, 184, 0.65);
  stroke-width: 1.1;
  stroke-dasharray: 4 3;
}

.center-reference-point {
  fill: rgba(148, 163, 184, 0.9);
  stroke: rgba(15, 23, 42, 0.95);
  stroke-width: 1;
}

.province-shape {
  fill: rgba(56, 189, 248, 0.23);
  stroke: rgba(125, 211, 252, 0.95);
  stroke-width: 1.8;
}

.province-shape.selected {
  fill: rgba(250, 204, 21, 0.26);
  stroke: rgba(250, 204, 21, 0.95);
  stroke-width: 2.3;
}

.draft-line {
  fill: none;
  stroke: rgba(250, 204, 21, 0.95);
  stroke-width: 2;
  stroke-dasharray: 7 5;
}

.draft-preview-shape {
  fill: rgba(250, 204, 21, 0.16);
  stroke: rgba(250, 204, 21, 0.9);
  stroke-width: 1.8;
}

.draft-point {
  fill: #22d3ee;
  stroke: rgba(2, 6, 23, 0.92);
  stroke-width: 2;
}

.draft-point.first {
  fill: #f43f5e;
}

.existing-point {
  fill: rgba(226, 232, 240, 0.5);
}

.snap-target {
  fill: rgba(34, 211, 238, 0.18);
  stroke: rgba(34, 211, 238, 0.95);
  stroke-width: 1.6;
}

.cursor-point {
  fill: rgba(248, 250, 252, 0.75);
}

@media (max-width: 1100px) {
  .visual-creator-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .board-panel {
    min-height: 520px;
  }
}
</style>
