<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TroopSelectionPanel from '../components/game/TroopSelectionPanel.vue'
import { buildBorderSegments, normalizeMapJson, type MapJsonData } from '../utils/mapData'
import {
  findShortestPath,
  isPointOccupied,
  type CombatTroop,
} from '../utils/troopLogic'

const mapData = ref<MapJsonData | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const troops = ref<CombatTroop[]>([])
const selectedTroopId = ref<number | null>(null)
const destinationPointId = ref<number | null>(null)
const isMovementMode = ref(false)
const movementRoute = ref<number[]>([])
const hoveredDestinationId = ref<number | null>(null)
const countryNames = ref<Record<string, string>>({})
const selectedProvince = ref<{ id: number; name: string; owner: string } | null>(null)
const movementState = ref<{
  troopId: number
  route: number[]
  segmentIndex: number
  traveledInSegment: number
  speed: number
  currentX: number
  currentY: number
  lastPointId: number
  finalPointId: number
} | null>(null)
let movementTimer: number | null = null

const boardWidth = computed(() => mapData.value?.width ?? 1200)
const boardHeight = computed(() => mapData.value?.height ?? 800)

const mapTransform = computed(() => {
  const width = boardWidth.value
  const height = boardHeight.value
  const offsetX = (width - width / zoom.value) / 2 + panX.value
  const offsetY = (height - height / zoom.value) / 2 + panY.value
  return `translate(${offsetX} ${offsetY}) scale(${zoom.value})`
})

const countryPalette: Record<string, string> = {
  default: '#94a3b8',
  1: '#3b82f6',
  2: '#ef4444',
  3: '#22c55e',
  4: '#f59e0b',
  5: '#8b5cf6',
  6: '#ec4899',
  7: '#14b8a6',
}

const troopCountryToId: Record<string, number> = {
  blue: 1,
  red: 2,
}

const borderSegments = computed(() => {
  return buildBorderSegments(mapData.value?.points ?? [])
})

const pointMap = computed(() => new Map((mapData.value?.points ?? []).map((point) => [point.id, point])))

const selectedTroop = computed(() => troops.value.find((troop) => troop.id === selectedTroopId.value) ?? null)

function getTroopRenderPosition(troop: CombatTroop) {
  if (movementState.value && movementState.value.troopId === troop.id) {
    return {
      x: movementState.value.currentX,
      y: movementState.value.currentY,
    }
  }

  const point = pointMap.value.get(troop.pointId ?? -1)
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
  }
}

const previewSegments = computed(() => {
  const troop = selectedTroop.value
  const hoverTargetId = hoveredDestinationId.value

  if (!isMovementMode.value || !troop || troop.pointId === null || hoverTargetId === null) {
    return []
  }

  const points = mapData.value?.points ?? []
  if (points.length === 0) {
    return []
  }

  const route = findShortestPath(troop.pointId, hoverTargetId, points)
  if (route.length < 2) {
    return []
  }

  const pointMapPreview = new Map(points.map((point) => [point.id, point]))
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []

  for (let index = 0; index < route.length - 1; index += 1) {
    const fromId = route[index]
    const toId = route[index + 1]
    const fromPoint = pointMapPreview.get(fromId)
    const toPoint = pointMapPreview.get(toId)

    if (!fromPoint || !toPoint) {
      continue
    }

    segments.push({
      key: `preview-${fromId}-${toId}`,
      x1: fromPoint.x,
      y1: fromPoint.y,
      x2: toPoint.x,
      y2: toPoint.y,
    })
  }

  return segments
})

function getPointColor(countryId: number | string | null | undefined) {
  if (countryId === null || countryId === undefined || countryId === '') {
    return countryPalette.default
  }

  return countryPalette[String(countryId)] ?? countryPalette.default
}

function resetTroopsForMap() {
  const points = mapData.value?.points ?? []
  const fallbackPointId = points[0]?.id ?? null
  const nextTroops: CombatTroop[] = []

  for (const troop of troops.value) {
    const pointId = troop.pointId !== null && points.some((point) => point.id === troop.pointId)
      ? troop.pointId
      : fallbackPointId

    nextTroops.push({
      ...troop,
      pointId,
    })
  }

  troops.value = nextTroops
}

async function loadLocalTestData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [countriesResponse, mapResponse, troopsResponse] = await Promise.all([
      fetch('/teste/countries.json'),
      fetch('/teste/map.json'),
      fetch('/teste/troops.json'),
    ])

    if (!countriesResponse.ok) {
      throw new Error(`countries.json falhou: ${countriesResponse.status}`)
    }

    if (!mapResponse.ok) {
      throw new Error(`map.json falhou: ${mapResponse.status}`)
    }

    if (!troopsResponse.ok) {
      throw new Error(`troops.json falhou: ${troopsResponse.status}`)
    }

    const countriesData = await countriesResponse.json()
    const mapDataPayload = await mapResponse.json()
    const troopsData = await troopsResponse.json()

    const loadedCountries = Array.isArray(countriesData)
      ? countriesData
      : (countriesData?.countries ?? [])

    countryNames.value = Object.fromEntries(
      loadedCountries.map((country: { id?: number | string; name?: string }) => [String(country.id ?? ''), country.name ?? 'Desconhecido']),
    )

    const normalizedMap = normalizeMapJson(mapDataPayload)
    mapData.value = normalizedMap

    const rawTroops = Array.isArray(troopsData)
      ? troopsData
      : (troopsData?.troops ?? [])

    troops.value = rawTroops.map((troop: any, index: number) => ({
      id: Number(troop.id ?? index + 1),
      country: troop.country === 'red' ? 'red' : 'blue',
      pointId: troop.pointId ?? troop.point_id ?? null,
      label: troop.label ?? troop.name ?? `Tropa ${index + 1}`,
      speed: Number(troop.speed ?? 80),
    }))

    if (loadedCountries.length > 0) {
      console.info('Countries carregadas:', loadedCountries.length)
    }

    resetTroopsForMap()
  } catch (error) {
    mapData.value = null
    troops.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Erro ao carregar os dados locais de teste.'
  } finally {
    isLoading.value = false
  }
}

function selectTroop(troopId: number) {
  selectedTroopId.value = troopId
  isMovementMode.value = false
  const troop = troops.value.find((item) => item.id === troopId)
  destinationPointId.value = troop?.pointId ?? null
  errorMessage.value = ''
}

function startMovementMode() {
  if (!selectedTroop.value) {
    return
  }

  isMovementMode.value = true
}

function stopMovementLoop() {
  if (movementTimer !== null) {
    window.clearInterval(movementTimer)
    movementTimer = null
  }

  movementState.value = null
  movementRoute.value = []
}

function claimProvinceIfNeutral(troop: CombatTroop, pointId: number) {
  const point = (mapData.value?.points ?? []).find((item) => item.id === pointId)
  if (!point) {
    return
  }

  const isNeutral = point.country_id === null || point.country_id === undefined || point.country_id === ''
  if (!isNeutral) {
    return
  }

  const countryId = troopCountryToId[troop.country] ?? 1

  mapData.value = {
    ...mapData.value,
    points: (mapData.value?.points ?? []).map((item) => (
      item.id === pointId
        ? { ...item, country_id: countryId }
        : item
    )),
  }

  if (selectedProvince.value?.id === pointId) {
    selectedProvince.value = {
      ...selectedProvince.value,
      owner: countryNames.value[String(countryId)] ?? `País ${countryId}`,
    }
  }
}

function advanceAlongRoute() {
  const movement = movementState.value
  const troop = selectedTroop.value

  if (!movement || !troop) {
    stopMovementLoop()
    return
  }

  const route = movement.route
  const points = mapData.value?.points ?? []
  const pointMapRuntime = new Map(points.map((point) => [point.id, point]))

  if (route.length < 2 || movement.segmentIndex >= route.length - 1) {
    troops.value = troops.value.map((item) => {
      if (item.id !== troop.id) {
        return item
      }

      return {
        ...item,
        pointId: movement.finalPointId,
      }
    })

    destinationPointId.value = movement.finalPointId
    stopMovementLoop()
    isMovementMode.value = false
    errorMessage.value = ''
    return
  }

  const currentPoint = pointMapRuntime.get(route[movement.segmentIndex])
  const nextPoint = pointMapRuntime.get(route[movement.segmentIndex + 1])

  if (!currentPoint || !nextPoint) {
    stopMovementLoop()
    return
  }

  const segmentLength = Math.hypot(nextPoint.x - currentPoint.x, nextPoint.y - currentPoint.y)
  const deltaTime = 16
  const traveledThisFrame = (movement.speed * deltaTime) / 1000
  const remainingDistance = segmentLength - movement.traveledInSegment

  let nextTravel = movement.traveledInSegment + traveledThisFrame
  let nextX = currentPoint.x
  let nextY = currentPoint.y

  if (traveledThisFrame >= remainingDistance) {
    const nextSegmentIndex = movement.segmentIndex + 1
    const nextRoutePointId = route[nextSegmentIndex] ?? movement.finalPointId
    nextX = nextPoint.x
    nextY = nextPoint.y

    troops.value = troops.value.map((item) => {
      if (item.id !== troop.id) {
        return item
      }

      return {
        ...item,
        pointId: nextRoutePointId,
      }
    })

    claimProvinceIfNeutral(troop, nextRoutePointId)

    movement.segmentIndex = nextSegmentIndex
    movement.traveledInSegment = 0
    movement.currentX = nextX
    movement.currentY = nextY
    movement.lastPointId = nextRoutePointId

    if (nextRoutePointId === movement.finalPointId) {
      destinationPointId.value = movement.finalPointId
      stopMovementLoop()
      isMovementMode.value = false
      errorMessage.value = ''
      return
    }

    return
  }

  const ratio = nextTravel / segmentLength
  nextX = currentPoint.x + (nextPoint.x - currentPoint.x) * ratio
  nextY = currentPoint.y + (nextPoint.y - currentPoint.y) * ratio

  movement.traveledInSegment = nextTravel
  movement.currentX = nextX
  movement.currentY = nextY
}

function moveSelectedTroop(targetPointId: number | null = destinationPointId.value) {
  const troop = selectedTroop.value
  if (!troop || targetPointId === null || troop.pointId === null) {
    return
  }

  const points = mapData.value?.points ?? []

  if (isPointOccupied(troops.value, targetPointId) && targetPointId !== troop.pointId) {
    errorMessage.value = 'Esse ponto já está ocupado por outra tropa.'
    return
  }

  const path = findShortestPath(troop.pointId, targetPointId, points)
  if (path.length === 0) {
    errorMessage.value = 'Não existe rota válida até esse ponto.'
    return
  }

  stopMovementLoop()
  movementRoute.value = path
  destinationPointId.value = targetPointId
  isMovementMode.value = false

  const startPoint = pointMap.value.get(troop.pointId)
  const currentPosition = startPoint ?? { x: 0, y: 0 }

  movementState.value = {
    troopId: troop.id,
    route: path,
    segmentIndex: 0,
    traveledInSegment: 0,
    speed: troop.speed ?? 80,
    currentX: currentPosition.x,
    currentY: currentPosition.y,
    lastPointId: troop.pointId,
    finalPointId: targetPointId,
  }

  movementTimer = window.setInterval(() => {
    advanceAlongRoute()
  }, 16)

  if (path.length <= 2) {
    const finalPoint = pointMap.value.get(targetPointId)
    if (finalPoint) {
      movementState.value = {
        troopId: troop.id,
        route: path,
        segmentIndex: 0,
        traveledInSegment: 0,
        speed: troop.speed ?? 80,
        currentX: finalPoint.x,
        currentY: finalPoint.y,
        lastPointId: troop.pointId,
        finalPointId: targetPointId,
      }
    }

    claimProvinceIfNeutral(troop, targetPointId)
    advanceAlongRoute()
  }
}

function handleMapPointMouseEnter(pointId: number) {
  if (!selectedTroop.value || !isMovementMode.value) {
    return
  }

  hoveredDestinationId.value = pointId
}

function handleMapPointMouseLeave(pointId: number) {
  if (hoveredDestinationId.value === pointId) {
    hoveredDestinationId.value = null
  }
}

function openProvinceDetails(pointId: number) {
  const point = pointMap.value.get(pointId)

  if (!point) {
    return
  }

  const owner = point.country_id === null || point.country_id === undefined || point.country_id === ''
    ? 'Neutro'
    : countryNames.value[String(point.country_id)] ?? `País ${point.country_id}`

  selectedProvince.value = {
    id: point.id,
    name: point.name ?? `Ponto ${point.id}`,
    owner,
  }
}

function handleMapPointClick(pointId: number) {
  if (!selectedTroop.value) {
    openProvinceDetails(pointId)
    return
  }

  if (!isMovementMode.value) {
    destinationPointId.value = pointId
    openProvinceDetails(pointId)
    return
  }

  hoveredDestinationId.value = null
  moveSelectedTroop(pointId)
}

function setZoom(nextZoom: number) {
  zoom.value = Math.min(20, Math.max(0.25, Number(nextZoom) || 1))
}

function moveMapByCursor(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const edgeThreshold = 80
  const panStep = 18

  if (localX < edgeThreshold) {
    panX.value += panStep
  } else if (localX > rect.width - edgeThreshold) {
    panX.value -= panStep
  }

  if (localY < edgeThreshold) {
    panY.value += panStep
  } else if (localY > rect.height - edgeThreshold) {
    panY.value -= panStep
  }
}

function onWheelZoom(event: WheelEvent) {
  event.preventDefault()

  const direction = event.deltaY < 0 ? 1.15 : 0.85
  const nextZoom = zoom.value * direction
  setZoom(nextZoom)
}

onMounted(() => {
  void loadLocalTestData()
})

onBeforeUnmount(() => {
  stopMovementLoop()
})
</script>

<template>
  <main class="combat-test-shell">
    <header class="toolbar">
      <div class="zoom-controls" aria-label="Controles de zoom do mapa">
        <button type="button" @click="setZoom(zoom / 1.2)">-</button>
        <button type="button" @click="setZoom(zoom * 1.2)">+</button>
      </div>
    </header>

    <div v-if="errorMessage" class="status error">
      {{ errorMessage }}
    </div>

    <div v-if="isLoading" class="status">
      Carregando mapa...
    </div>

    <div v-else-if="mapData && (mapData.points ?? []).length" class="map-stage">
      <div class="board-wrap" @wheel="onWheelZoom" @mousemove="moveMapByCursor">
        <svg
          class="board-svg"
          :width="boardWidth"
          :height="boardHeight"
          :viewBox="`0 0 ${boardWidth} ${boardHeight}`"
          role="img"
          aria-label="Mapa de combate"
        >
          <g :transform="mapTransform" class="map-content">
            <g v-if="previewSegments.length" class="preview-route-layer">
              <line
                v-for="segment in previewSegments"
                :key="segment.key"
                :x1="segment.x1"
                :y1="segment.y1"
                :x2="segment.x2"
                :y2="segment.y2"
                class="route-preview-line"
              />
            </g>

            <g class="borders-layer">
              <line
                v-for="segment in borderSegments"
                :key="segment.key"
                :x1="segment.x1"
                :y1="segment.y1"
                :x2="segment.x2"
                :y2="segment.y2"
                stroke="#cbd5e1"
                stroke-width="2"
                stroke-linecap="round"
                opacity="0.8"
              />
            </g>

            <g class="points-layer">
              <circle
                v-for="point in mapData.points"
                :key="point.id"
                :cx="point.x"
                :cy="point.y"
                :r="hoveredDestinationId === point.id && isMovementMode ? 8 : 5"
                :fill="getPointColor(point.country_id)"
                stroke="#0f172a"
                :stroke-width="selectedTroop?.pointId === point.id ? 4 : hoveredDestinationId === point.id && isMovementMode ? 3 : 1.5"
                :opacity="selectedTroop?.pointId === point.id ? 1 : hoveredDestinationId === point.id && isMovementMode ? 1 : 0.95"
                @mouseenter="handleMapPointMouseEnter(point.id)"
                @mouseleave="handleMapPointMouseLeave(point.id)"
                @click="handleMapPointClick(point.id)"
              />

              <text
                v-for="point in mapData.points"
                :key="`label-${point.id}`"
                :x="point.x + 8"
                :y="point.y - 8"
                font-size="10"
                fill="#e2e8f0"
              >
                {{ point.name ?? point.id }}
              </text>

              <g v-for="troop in troops" :key="troop.id">
                <circle
                  :cx="getTroopRenderPosition(troop).x"
                  :cy="getTroopRenderPosition(troop).y"
                  r="10"
                  :fill="troop.country === 'blue' ? '#3b82f6' : '#ef4444'"
                  :stroke="selectedTroopId === troop.id ? '#f8fafc' : '#0f172a'"
                  stroke-width="2.5"
                  @click="selectTroop(troop.id)"
                />

                <text
                  :x="getTroopRenderPosition(troop).x + 14"
                  :y="getTroopRenderPosition(troop).y - 12"
                  font-size="10"
                  fill="#f8fafc"
                >
                  {{ troop.label }}
                </text>
              </g>
            </g>
          </g>
        </svg>
      </div>

      <TroopSelectionPanel
        v-if="selectedTroop"
        :troop="selectedTroop"
        :is-movement-mode="isMovementMode"
        @move="startMovementMode"
      />

      <aside v-if="selectedProvince" class="province-panel">
        <h3>{{ selectedProvince.name }}</h3>
        <p><strong>Owner:</strong> {{ selectedProvince.owner }}</p>
      </aside>
    </div>

    <div v-else class="status empty">
      Selecione um mapa para visualizar os pontos e bordas.
    </div>
  </main>
</template>

<style scoped>
.combat-test-shell {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background: #020817;
  color: #e2e8f0;
  box-sizing: border-box;
}

.toolbar {
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 30;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 1rem;
  pointer-events: none;
}

.toolbar > * {
  pointer-events: auto;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.82);
  border-radius: 12px;
}

.zoom-controls button {
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
}

.zoom-controls span {
  min-width: 4rem;
  text-align: center;
  font-weight: 700;
  color: #e2e8f0;
}

.controls-group {
  display: flex;
  align-items: end;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 280px;
}

.compact-field {
  min-width: 180px;
}

.field span {
  font-size: 0.8rem;
  color: #cbd5e1;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field select {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.82);
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  font-size: 0.95rem;
}

.action-button {
  border: 1px solid rgba(96, 165, 250, 0.5);
  background: rgba(37, 99, 235, 0.18);
  color: #eff6ff;
  border-radius: 12px;
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.map-stage {
  position: relative;
  width: 100%;
  height: 100vh;
  z-index: 1;
}

.board-wrap {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.4));
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 20px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.35);
  cursor: grab;
  z-index: 1;
}

.board-wrap:active {
  cursor: grabbing;
}

.board-svg {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0 auto;
  background:
    linear-gradient(rgba(15, 23, 42, 0.2), rgba(15, 23, 42, 0.2)),
    rgba(15, 23, 42, 0.7);
  border-radius: 20px;
  transform-origin: center center;
}

.status {
  margin: 1rem auto 0;
  max-width: 900px;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.status.error {
  border-color: rgba(239, 68, 68, 0.5);
  color: #fecaca;
}

.status.empty {
  color: #cbd5e1;
}

.province-panel {
  position: absolute;
  right: 1.5rem;
  top: 1.5rem;
  z-index: 26;
  width: min(280px, 30vw);
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.45);
  pointer-events: auto;
}

.province-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #f8fafc;
}

.province-panel p {
  margin: 0;
  color: #cbd5e1;
}

.route-preview-line {
  stroke: #facc15;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 10 8;
  animation: routePulse 0.8s linear infinite;
  filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.8));
}

@keyframes routePulse {
  0% {
    stroke-dashoffset: 0;
    opacity: 0.8;
  }
  50% {
    stroke-dashoffset: -18;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: -36;
    opacity: 0.9;
  }
}

</style>
