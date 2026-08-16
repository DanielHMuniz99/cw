<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TroopSelectionPanel from '../components/game/TroopSelectionPanel.vue'
import { buildBorderSegments, normalizeMapJson, type MapJsonData, type MapPointData } from '../utils/mapData'
import {
  findShortestPath,
  type CombatTroop,
} from '../utils/troopLogic'

interface VisualProvince {
  id: number
  name: string
  country_id: number | string | null
  center_id: number | null
  vertices: Array<{ x: number; y: number }>
}

interface VisualMapData {
  width: number
  height: number
  provinces: VisualProvince[]
}

interface ArmyDivision {
  id: number
  name: string
  battalions: number[]
  pointId: number | null
  attack: number
  defense: number
  speed: number
}

interface ArmyGroup {
  id: number
  name: string
  troopIds: number[]
  divisionIds: number[]
}

const mapData = ref<MapJsonData | null>(null)
const visualMapData = ref<VisualMapData | null>(null)
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
const controlledCountryId = ref<number | null>(null)
const selectedTroopIds = ref<number[]>([])
const divisions = ref<ArmyDivision[]>([])
const selectedDivisionId = ref<number | null>(null)
const selectedDivisionIds = ref<number[]>([])
const selectedDivisionNameDraft = ref('')
const isPanningMap = ref(false)
const panDragStart = ref<{ x: number; y: number } | null>(null)
const panInitialOffset = ref<{ x: number; y: number } | null>(null)
const didPanMap = ref(false)
const suppressBoardClick = ref(false)
const selectedProvince = ref<{ id: number; name: string; owner: string } | null>(null)
const groups = ref<ArmyGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const frontlines = ref<Array<{
  id: number
  groupId: number
  name: string
  startPointId: number
  endPointId: number
  pathPointIds: number[]
  troopAssignments: Record<string, number[]>
}>>([])
const frontlineSelectionMode = ref(false)
const frontlineStartPointId = ref<number | null>(null)
const frontlinePreviewEndPointId = ref<number | null>(null)
const frontlineDragging = ref(false)
const newGroupName = ref('')
const movementStates = ref<Record<number, {
  troopId: number
  route: number[]
  segmentIndex: number
  traveledInSegment: number
  speed: number
  currentX: number
  currentY: number
  lastPointId: number
  finalPointId: number
}>>({})
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

function canTroopEnterPoint(troop: CombatTroop, pointId: number | null) {
  if (pointId === null) {
    return false
  }

  const point = (mapData.value?.points ?? []).find((item) => item.id === pointId)
  if (!point) {
    return false
  }

  const ownerValue = point.country_id
  const troopCountryId = troopCountryToId[troop.country]

  if (ownerValue === null || ownerValue === undefined || ownerValue === '') {
    return true
  }

  return Number(ownerValue) === troopCountryId
}

function findShortestTraversablePath(
  troop: CombatTroop,
  startPointId: number,
  targetPointId: number,
  points: NonNullable<MapJsonData['points']>,
) {
  if (startPointId === targetPointId) {
    return [startPointId]
  }

  if (!canTroopEnterPoint(troop, targetPointId)) {
    return []
  }

  const allowedPointIds = new Set<number>()

  for (const point of points) {
    if (canTroopEnterPoint(troop, point.id)) {
      allowedPointIds.add(point.id)
    }
  }

  allowedPointIds.add(startPointId)

  const constrainedPoints = points
    .filter((point) => allowedPointIds.has(point.id))
    .map((point) => ({
      ...point,
      borders: (point.borders ?? []).filter((neighborId) => allowedPointIds.has(neighborId)),
    }))

  return findShortestPath(startPointId, targetPointId, constrainedPoints)
}

const borderSegments = computed(() => {
  return buildBorderSegments(mapData.value?.points ?? [])
})

const pointMap = computed(() => new Map((mapData.value?.points ?? []).map((point) => [point.id, point])))
const visibleMapPoints = computed(() => (mapData.value?.points ?? []).filter((point) => point.center !== false))

const selectedTroop = computed(() => troops.value.find((troop) => troop.id === selectedTroopId.value) ?? null)
const troopLookup = computed(() => new Map(troops.value.map((troop) => [troop.id, troop])))
const divisionBattalionIds = computed(() => {
  const ids = new Set<number>()

  for (const division of divisions.value) {
    for (const battalionId of division.battalions) {
      ids.add(battalionId)
    }
  }

  return ids
})
const visibleBattalionTroops = computed(() => troops.value.filter((troop) => troop.military_organization !== 'division' && !divisionBattalionIds.value.has(troop.id)))
const divisionLookup = computed(() => new Map(divisions.value.map((division) => [division.id, division])))
const selectedDivisionsList = computed(() => divisions.value.filter((division) => selectedDivisionIds.value.includes(division.id)))
const selectedDivisionUnit = computed(() => selectedDivisionsList.value[0] ?? null)
const selectedDivisionBattalions = computed(() => {
  const selectedDivision = selectedDivisionUnit.value
  if (!selectedDivision) {
    return []
  }

  return troops.value.filter((troop) => troop.parent_id === selectedDivision.id && troop.military_organization !== 'division')
})
const selectedBattalionTroopIds = computed(() => {
  const battalionIds = new Set<number>(selectedTroopIds.value)

  for (const divisionId of selectedDivisionIds.value) {
    const division = divisionLookup.value.get(divisionId)
    if (!division) {
      continue
    }

    for (const battalionId of division.battalions) {
      battalionIds.add(battalionId)
    }
  }

  if (battalionIds.size === 0 && selectedTroopId.value !== null) {
    battalionIds.add(selectedTroopId.value)
  }

  if (battalionIds.size === 0 && selectedDivisionId.value !== null) {
    const division = divisionLookup.value.get(selectedDivisionId.value)
    if (division) {
      for (const battalionId of division.battalions) {
        battalionIds.add(battalionId)
      }
    }
  }

  return Array.from(battalionIds)
})
const selectedBattalionTroops = computed(() => selectedBattalionTroopIds.value
  .map((troopId) => troopLookup.value.get(troopId))
  .filter((troop): troop is CombatTroop => troop !== undefined))
const selectedLooseBattalionTroops = computed(() => selectedTroopIds.value
  .map((troopId) => troopLookup.value.get(troopId))
  .filter((troop): troop is CombatTroop => troop !== undefined)
  .filter((troop) => troop.military_organization !== 'division')
  .filter((troop) => !selectedDivisionUnit.value || troop.parent_id !== selectedDivisionUnit.value.id))
const hasUnitSelection = computed(() => selectedBattalionTroopIds.value.length > 0 || selectedDivisionIds.value.length > 0)
const selectedDivisionCanEdit = computed(() => selectedDivisionUnit.value !== null && selectedDivisionIds.value.length === 1)
const selectedBattalionToAddToDivision = computed(() => {
  if (!selectedDivisionCanEdit.value || selectedDivisionIds.value.length !== 1) {
    return null
  }

  return selectedLooseBattalionTroops.value.length > 0 ? selectedLooseBattalionTroops.value[0] : null
})

watch(selectedDivisionUnit, (division) => {
  selectedDivisionNameDraft.value = division?.name ?? ''
}, { immediate: true })
const troopStackByPoint = computed(() => {
  const stack = new Map<number, CombatTroop[]>()

  for (const troop of visibleBattalionTroops.value) {
    if (troop.pointId === null || movementStates.value[troop.id]) {
      continue
    }

    const list = stack.get(troop.pointId) ?? []
    list.push(troop)
    stack.set(troop.pointId, list)
  }

  for (const [pointId, troopList] of stack.entries()) {
    stack.set(pointId, [...troopList].sort((left, right) => left.id - right.id))
  }

  return stack
})
const troopStackSlotById = computed(() => {
  const slotByTroopId = new Map<number, { index: number; total: number }>()

  for (const troopList of troopStackByPoint.value.values()) {
    const total = troopList.length
    troopList.forEach((troop, index) => {
      slotByTroopId.set(troop.id, { index, total })
    })
  }

  return slotByTroopId
})
const stackedProvinceIndicators = computed(() => {
  const indicators: Array<{ pointId: number; x: number; y: number; count: number }> = []

  for (const [pointId, troopList] of troopStackByPoint.value.entries()) {
    if (troopList.length <= 1) {
      continue
    }

    const point = pointMap.value.get(pointId)
    if (!point) {
      continue
    }

    indicators.push({
      pointId,
      x: point.x,
      y: point.y,
      count: troopList.length,
    })
  }

  return indicators
})
const selectedGroup = computed(() => groups.value.find((group) => group.id === selectedGroupId.value) ?? null)
const groupsForPlayer = computed(() => groups.value.filter((group) => getGroupResolvedBattalionIds(group).some((troopId) => troopLookup.value.has(troopId))))
const divisionRenderItems = computed(() => divisions.value
  .map((division) => {
    const divisionTroop = troopLookup.value.get(division.id)
    if (divisionTroop) {
      const movement = movementStates.value[divisionTroop.id]
      if (movement) {
        return {
          ...division,
          x: movement.currentX,
          y: movement.currentY,
        }
      }

      const divisionPoint = pointMap.value.get(divisionTroop.pointId ?? -1)
      if (divisionPoint) {
        return {
          ...division,
          x: divisionPoint.x,
          y: divisionPoint.y,
        }
      }
    }

    if (division.pointId === null) {
      return null
    }

    const point = pointMap.value.get(division.pointId)
    if (!point) {
      return null
    }

    return {
      ...division,
      x: point.x,
      y: point.y,
    }
  })
  .filter((division): division is ArmyDivision & { x: number; y: number } => division !== null))
const visualProvincePolygons = computed(() => {
  if (!visualMapData.value) {
    return []
  }

  const pointLookup = pointMap.value

  return visualMapData.value.provinces
    .filter((province) => province.vertices.length >= 3)
    .map((province) => {
      const centerPoint = province.center_id !== null ? pointLookup.get(province.center_id) : undefined
      const effectiveCountry = province.country_id
        ?? centerPoint?.country_id
        ?? null
      const resolvedCenterId = centerPoint?.id
        ?? (province.center_id !== null ? province.center_id : null)

      return {
        id: province.id,
        name: province.name,
        centerId: resolvedCenterId,
        vertices: province.vertices,
        points: province.vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' '),
        fill: getPointColor(effectiveCountry),
      }
    })
})
const frontlineSegments = computed(() => {
  const points = mapData.value?.points ?? []
  const pointMapPreview = new Map(points.map((point) => [point.id, point]))

  return frontlines.value.flatMap((frontline) => {
    const path = frontline.pathPointIds
    if (path.length < 2) {
      return []
    }

    const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []

    for (let index = 0; index < path.length - 1; index += 1) {
      const fromId = path[index]
      const toId = path[index + 1]
      const fromPoint = pointMapPreview.get(fromId)
      const toPoint = pointMapPreview.get(toId)

      if (!fromPoint || !toPoint) {
        continue
      }

      segments.push({
        key: `frontline-${frontline.id}-${fromId}-${toId}`,
        x1: fromPoint.x,
        y1: fromPoint.y,
        x2: toPoint.x,
        y2: toPoint.y,
      })
    }

    return segments
  })
})

const frontlinePreviewSegments = computed(() => {
  if (!frontlineSelectionMode.value || frontlineStartPointId.value === null || frontlinePreviewEndPointId.value === null) {
    return []
  }

  const points = mapData.value?.points ?? []
  const pointMapPreview = new Map(points.map((point) => [point.id, point]))
  const path = buildFrontlinePath(frontlineStartPointId.value, frontlinePreviewEndPointId.value)
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []

  for (let index = 0; index < path.length - 1; index += 1) {
    const fromId = path[index]
    const toId = path[index + 1]
    const fromPoint = pointMapPreview.get(fromId)
    const toPoint = pointMapPreview.get(toId)

    if (!fromPoint || !toPoint) {
      continue
    }

    segments.push({
      key: `frontline-preview-${fromId}-${toId}`,
      x1: fromPoint.x,
      y1: fromPoint.y,
      x2: toPoint.x,
      y2: toPoint.y,
    })
  }

  return segments
})

function getTroopRenderPosition(troop: CombatTroop) {
  const movement = movementStates.value[troop.id]
  if (movement) {
    return {
      x: movement.currentX,
      y: movement.currentY,
    }
  }

  const point = pointMap.value.get(troop.pointId ?? -1)
  const baseX = point?.x ?? 0
  const baseY = point?.y ?? 0
  const slot = troopStackSlotById.value.get(troop.id)

  if (!slot || slot.total <= 1) {
    return {
      x: baseX,
      y: baseY,
    }
  }

  const spacingRadius = slot.total <= 2 ? 8 : slot.total <= 4 ? 12 : 15
  const angle = ((Math.PI * 2) / slot.total) * slot.index - Math.PI / 2

  return {
    x: baseX + Math.cos(angle) * spacingRadius,
    y: baseY + Math.sin(angle) * spacingRadius,
  }
}

const previewSegments = computed(() => {
  const hoverTargetId = hoveredDestinationId.value

  if (!isMovementMode.value || hoverTargetId === null) {
    return []
  }

  const points = mapData.value?.points ?? []
  if (points.length === 0) {
    return []
  }

  const activeTroops = getSelectionMovementTroops()

  if (!activeTroops.length || !isCenterPoint(hoverTargetId)) {
    return []
  }

  const pointMapPreview = new Map(points.map((point) => [point.id, point]))
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; color: string }> = []

  for (const troop of activeTroops) {
    if (troop.pointId === null) {
      continue
    }

    const route = findShortestTraversablePath(troop, troop.pointId, hoverTargetId, points)
    if (route.length < 2) {
      continue
    }

    for (let index = 0; index < route.length - 1; index += 1) {
      const fromId = route[index]
      const toId = route[index + 1]
      const fromPoint = pointMapPreview.get(fromId)
      const toPoint = pointMapPreview.get(toId)

      if (!fromPoint || !toPoint) {
        continue
      }

      segments.push({
        key: `preview-${troop.id}-${fromId}-${toId}`,
        x1: fromPoint.x,
        y1: fromPoint.y,
        x2: toPoint.x,
        y2: toPoint.y,
        color: troop.country === 'blue' ? '#60a5fa' : '#fca5a5',
      })
    }
  }

  return segments
})

function getPointColor(countryId: number | string | null | undefined) {
  if (countryId === null || countryId === undefined || countryId === '') {
    return countryPalette.default
  }

  return countryPalette[String(countryId)] ?? countryPalette.default
}

function getWorldPointFromMouseEvent(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const svgNode = target.querySelector('.board-svg') as SVGSVGElement | null
  const mapContentNode = svgNode?.querySelector('.map-content') as SVGGElement | null

  if (svgNode && mapContentNode) {
    const matrix = mapContentNode.getScreenCTM()
    if (matrix) {
      const point = svgNode.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const worldPoint = point.matrixTransform(matrix.inverse())

      return {
        x: worldPoint.x,
        y: worldPoint.y,
      }
    }
  }

  const rect = target.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top

  const width = boardWidth.value
  const height = boardHeight.value
  const offsetX = (width - width / zoom.value) / 2 + panX.value
  const offsetY = (height - height / zoom.value) / 2 + panY.value

  return {
    x: (localX - offsetX) / zoom.value,
    y: (localY - offsetY) / zoom.value,
  }
}

function getSvgPointFromMouseEvent(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const svgNode = target.querySelector('.board-svg') as SVGSVGElement | null

  if (!svgNode) {
    return null
  }

  const matrix = svgNode.getScreenCTM()
  if (!matrix) {
    return null
  }

  const point = svgNode.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const svgPoint = point.matrixTransform(matrix.inverse())

  return {
    x: svgPoint.x,
    y: svgPoint.y,
  }
}

function isPointInsidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let isInside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const vertexI = polygon[i]
    const vertexJ = polygon[j]
    const intersects = ((vertexI.y > point.y) !== (vertexJ.y > point.y))
      && (point.x < ((vertexJ.x - vertexI.x) * (point.y - vertexI.y)) / ((vertexJ.y - vertexI.y) || 1e-9) + vertexI.x)

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}

function findCenterIdByWorldPoint(worldPoint: { x: number; y: number }) {
  for (const province of visualProvincePolygons.value) {
    if (province.centerId === null || province.vertices.length < 3) {
      continue
    }

    if (isPointInsidePolygon(worldPoint, province.vertices)) {
      return province.centerId
    }
  }

  return null
}

function findNearestPointIdByWorldPoint(worldPoint: { x: number; y: number }) {
  const points = mapData.value?.points ?? []
  if (!points.length) {
    return null
  }

  let closestPointId: number | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const point of points) {
    const distance = Math.hypot(point.x - worldPoint.x, point.y - worldPoint.y)
    if (distance < closestDistance) {
      closestDistance = distance
      closestPointId = point.id
    }
  }

  return closestPointId
}

function resolvePointIdFromMouseEvent(event: MouseEvent) {
  const worldPoint = getWorldPointFromMouseEvent(event)
  const fromProvince = findCenterIdByWorldPoint(worldPoint)
  const hasVisualMap = visualProvincePolygons.value.length > 0

  if (fromProvince !== null) {
    return fromProvince
  }

  if (hasVisualMap) {
    return null
  }

  return findNearestPointIdByWorldPoint(worldPoint)
}

function normalizeVisualMap(data: unknown): VisualMapData | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const candidate = data as Record<string, unknown>
  const width = typeof candidate.width === 'number' ? candidate.width : 0
  const height = typeof candidate.height === 'number' ? candidate.height : 0
  const rawProvinces = Array.isArray(candidate.provinces) ? candidate.provinces : []

  const provinces = rawProvinces.reduce<VisualProvince[]>((accumulator, province, index) => {
    if (!province || typeof province !== 'object') {
      return accumulator
    }

    const entry = province as Record<string, unknown>
    const id = Number(entry.id ?? index + 1)
    const name = typeof entry.name === 'string' ? entry.name : `Província ${id}`
    const center_id = entry.center_id === null || entry.center_id === undefined
      ? null
      : Number(entry.center_id)
    const country_id = entry.country_id === null || entry.country_id === undefined || entry.country_id === ''
      ? null
      : (typeof entry.country_id === 'number' || typeof entry.country_id === 'string' ? entry.country_id : null)

    const vertices = Array.isArray(entry.vertices)
      ? entry.vertices
          .map((vertex) => {
            if (!vertex || typeof vertex !== 'object') {
              return null
            }

            const pointEntry = vertex as Record<string, unknown>
            const x = Number(pointEntry.x)
            const y = Number(pointEntry.y)

            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return null
            }

            return { x, y }
          })
          .filter((vertex): vertex is { x: number; y: number } => vertex !== null)
      : []

    accumulator.push({
      id,
      name,
      country_id,
      center_id: Number.isFinite(center_id as number) ? Number(center_id) : null,
      vertices,
    })

    return accumulator
  }, [])

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return {
    width,
    height,
    provinces,
  }
}

function isCenterPoint(pointId: number | null) {
  if (pointId === null) {
    return false
  }

  const point = pointMap.value.get(pointId)
  return point ? point.center !== false : false
}

function isPointFrontlineEligible(pointId: number | null) {
  if (pointId === null) {
    return false
  }

  if (controlledCountryId.value === null) {
    return false
  }

  const point = pointMap.value.get(pointId)
  if (!point) {
    return false
  }

  const pointCountryId = point.country_id
  if (pointCountryId === null || pointCountryId === undefined || pointCountryId === '') {
    return false
  }

  const normalizedCountryId = Number(pointCountryId)
  if (!Number.isFinite(normalizedCountryId)) {
    return false
  }

  if (normalizedCountryId !== controlledCountryId.value) {
    return false
  }

  return (point.borders ?? []).some((neighborId) => {
    const neighbor = pointMap.value.get(neighborId)
    if (!neighbor) {
      return false
    }

    const neighborCountryId = neighbor.country_id
    if (neighborCountryId === null || neighborCountryId === undefined || neighborCountryId === '') {
      return false
    }

    const normalizedNeighborCountryId = Number(neighborCountryId)
    return Number.isFinite(normalizedNeighborCountryId) && normalizedNeighborCountryId !== normalizedCountryId
  })
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
  syncDerivedDivisions()
}

function syncDerivedDivisions() {
  divisions.value = deriveDivisionsFromUnits(troops.value)
}

function setTroops(nextTroops: CombatTroop[]) {
  troops.value = nextTroops
  syncDerivedDivisions()
}

function updateTroopById(troopId: number, updater: (troop: CombatTroop) => CombatTroop) {
  setTroops(troops.value.map((troop) => (troop.id === troopId ? updater(troop) : troop)))
}

function isBattalion(troop: CombatTroop) {
  return troop.military_organization !== 'division'
}

function isDivision(troop: CombatTroop) {
  return troop.military_organization === 'division'
}

function cancelPendingJoinForTroop(troopId: number) {
  const movement = movementStates.value[troopId]
  if (movement) {
    stopMovementForTroop(troopId)
  }

  updateTroopById(troopId, (troop) => ({
    ...troop,
    pending_division_id: null,
  }))
}

function cancelPendingJoinForDivision(divisionId: number) {
  const pendingTroops = troops.value.filter((troop) => troop.pending_division_id === divisionId)
  for (const troop of pendingTroops) {
    cancelPendingJoinForTroop(troop.id)
  }
}

function syncDivisionBattalionPositions(divisionId: number, pointId: number) {
  const battalionIds = new Set(getDivisionBattalionIds(divisionId))

  if (!battalionIds.size) {
    return
  }

  setTroops(troops.value.map((troop) => {
    if (troop.parent_id !== divisionId || !battalionIds.has(troop.id)) {
      return troop
    }

    return {
      ...troop,
      pointId,
    }
  }))
}

function getSelectionMovementTroops() {
  const selectedDivisionTroops = selectedDivisionIds.value
    .map((divisionId) => troopLookup.value.get(divisionId))
    .filter((troop): troop is CombatTroop => troop !== undefined)
    .filter(isDivision)

  if (selectedDivisionTroops.length > 0) {
    return selectedDivisionTroops
  }

  return selectedBattalionTroops.value.filter(isBattalion)
}

function scheduleTroopMovement(troop: CombatTroop, targetPointId: number, options?: { pendingDivisionId?: number | null }) {
  const points = mapData.value?.points ?? []
  if (troop.pointId === null) {
    return false
  }

  const path = findShortestTraversablePath(troop, troop.pointId, targetPointId, points)
  if (path.length === 0) {
    return false
  }

  const startPoint = pointMap.value.get(troop.pointId)
  const currentPosition = startPoint ?? { x: 0, y: 0 }

  movementStates.value = {
    ...movementStates.value,
    [troop.id]: {
      troopId: troop.id,
      route: path,
      segmentIndex: 0,
      traveledInSegment: 0,
      speed: troop.speed ?? 80,
      currentX: currentPosition.x,
      currentY: currentPosition.y,
      lastPointId: troop.pointId,
      finalPointId: targetPointId,
    },
  }

  updateTroopById(troop.id, (item) => ({
    ...item,
    pending_division_id: options?.pendingDivisionId ?? item.pending_division_id ?? null,
  }))

  return true
}

function normalizeDivisionBattalionIds(battalions: Array<number | string> | undefined) {
  return Array.from(new Set(
    (battalions ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
  ))
}

function computeDivisionStats(battalionIds: number[], unitLookup: Map<number, CombatTroop>) {
  const battalions = battalionIds
    .map((id) => unitLookup.get(id))
    .filter((unit): unit is CombatTroop => unit !== undefined)

  if (!battalions.length) {
    return {
      attack: 0,
      defense: 0,
      speed: 0,
    }
  }

  const attack = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.attack ?? 0), 0) / battalions.length)
  const defense = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.defense ?? 0), 0) / battalions.length)
  const speed = Math.min(...battalions.map((battalion) => battalion.speed ?? 80))

  return {
    attack,
    defense,
    speed,
  }
}

function deriveDivisionsFromUnits(units: CombatTroop[]) {
  const unitLookup = new Map(units.map((unit) => [unit.id, unit]))
  const divisionUnits = units.filter((unit) => unit.military_organization === 'division')

  return divisionUnits.map((divisionUnit, index) => {
    const battalionIds = normalizeDivisionBattalionIds(
      units
        .filter((unit) => unit.parent_id === divisionUnit.id)
        .map((unit) => unit.id),
    )
    const pointId = divisionUnit.pointId !== null && Number.isFinite(divisionUnit.pointId)
      ? divisionUnit.pointId
      : null
    const stats = computeDivisionStats(battalionIds, unitLookup)
    const battalionPoints = battalionIds
      .map((battalionId) => unitLookup.get(battalionId))
      .filter((unit): unit is CombatTroop => unit !== undefined)
      .map((unit) => unit.pointId)
      .filter((pointId): pointId is number => pointId !== null && Number.isFinite(pointId))
    const resolvedPointId = pointId ?? battalionPoints[0] ?? null

    return {
      id: divisionUnit.id,
      name: divisionUnit.name ?? divisionUnit.label ?? `Divisão ${index + 1}`,
      battalions: battalionIds,
      pointId: resolvedPointId,
      attack: divisionUnit.attack ?? stats.attack,
      defense: divisionUnit.defense ?? stats.defense,
      speed: divisionUnit.speed ?? stats.speed,
    }
  })
}

function normalizeGroupTroopIds(troopIds: Array<number | string> | undefined) {
  return Array.from(new Set(
    (troopIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
  ))
}

function normalizeGroupDivisionIds(divisionIds: Array<number | string> | undefined) {
  return Array.from(new Set(
    (divisionIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
  ))
}

function getDivisionBattalionIds(divisionId: number) {
  return divisionLookup.value.get(divisionId)?.battalions ?? []
}

function getGroupResolvedBattalionIds(group: ArmyGroup) {
  const resolved = new Set<number>(normalizeGroupTroopIds(group.troopIds))

  for (const divisionId of normalizeGroupDivisionIds(group.divisionIds)) {
    for (const battalionId of getDivisionBattalionIds(divisionId)) {
      resolved.add(battalionId)
    }
  }

  return Array.from(resolved)
}

function getGroupFrontlineUnitIds(group: ArmyGroup) {
  const divisionIds = normalizeGroupDivisionIds(group.divisionIds)
  const divisionIdSet = new Set(divisionIds)

  const troopIds = normalizeGroupTroopIds(group.troopIds)
    .map((troopId) => troopLookup.value.get(troopId))
    .filter((troop): troop is CombatTroop => troop !== undefined)
    .filter((troop) => troop.military_organization !== 'division')
    .filter((troop) => {
      if (troop.parent_id === null || troop.parent_id === undefined) {
        return true
      }

      return !divisionIdSet.has(troop.parent_id)
    })
    .map((troop) => troop.id)

  const validDivisionIds = divisionIds
    .map((divisionId) => troopLookup.value.get(divisionId))
    .filter((troop): troop is CombatTroop => troop !== undefined)
    .filter((troop) => troop.military_organization === 'division')
    .map((troop) => troop.id)

  return Array.from(new Set([...troopIds, ...validDivisionIds]))
}

function reconcileGroupMembership(groupList: ArmyGroup[]) {
  const troopToGroup = new Map<number, number>()
  const divisionToGroup = new Map<number, number>()

  const normalized = groupList.map((group) => ({
    ...group,
    troopIds: normalizeGroupTroopIds(group.troopIds),
    divisionIds: normalizeGroupDivisionIds(group.divisionIds),
  }))

  const nextGroups: ArmyGroup[] = []

  for (const group of normalized) {
    const refinedTroopIds: number[] = []
    const refinedDivisionIds: number[] = []

    for (const troopId of group.troopIds) {
      if (troopToGroup.has(troopId)) {
        continue
      }

      troopToGroup.set(troopId, group.id)
      refinedTroopIds.push(troopId)
    }

    for (const divisionId of group.divisionIds) {
      if (divisionToGroup.has(divisionId)) {
        continue
      }

      divisionToGroup.set(divisionId, group.id)
      refinedDivisionIds.push(divisionId)
    }

    nextGroups.push({
      ...group,
      troopIds: refinedTroopIds,
      divisionIds: refinedDivisionIds,
    })
  }

  return nextGroups.filter((group) => group.troopIds.length > 0 || group.divisionIds.length > 0)
}

function saveGroups() {
  try {
    localStorage.setItem('trojan-player-groups', JSON.stringify(groups.value))
  } catch (error) {
    console.warn('Não foi possível salvar os grupos no armazenamento local.', error)
  }
}

function saveFrontlines() {
  try {
    localStorage.setItem('trojan-frontlines', JSON.stringify(frontlines.value))
  } catch (error) {
    console.warn('Não foi possível salvar as linhas de frente no armazenamento local.', error)
  }
}

async function loadFrontlines() {
  try {
    const response = await fetch('/teste/frontlines.json')
    if (response.ok) {
      const parsed = await response.json()
      frontlines.value = Array.isArray(parsed) ? parsed : []
      if (frontlines.value.length > 0) {
        return
      }
    }

    const raw = localStorage.getItem('trojan-frontlines')
    if (!raw) {
      frontlines.value = []
      return
    }

    const parsed = JSON.parse(raw)
    frontlines.value = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Não foi possível carregar as linhas de frente.', error)
    frontlines.value = []
  }
}

async function loadGroups() {
  try {
    const response = await fetch('/teste/groups.json')
    if (response.ok) {
      const parsedGroups = await response.json()
      const nextGroups = Array.isArray(parsedGroups)
        ? reconcileGroupMembership(
            parsedGroups.map((group: { id?: number | string; name?: string; troopIds?: Array<number | string>; divisionIds?: Array<number | string> }) => ({
              id: Number(group.id ?? Date.now() + Math.random()),
              name: String(group.name ?? 'Grupo'),
              troopIds: normalizeGroupTroopIds(group.troopIds),
              divisionIds: normalizeGroupDivisionIds(group.divisionIds),
            })),
          )
        : []

      groups.value = nextGroups

      if (nextGroups.length === 0) {
        localStorage.removeItem('trojan-player-groups')
      }

      return
    }

    const rawGroups = localStorage.getItem('trojan-player-groups')
    if (!rawGroups) {
      groups.value = []
      return
    }

    const parsedGroups = JSON.parse(rawGroups)
    groups.value = Array.isArray(parsedGroups)
      ? reconcileGroupMembership(
          parsedGroups.map((group: { id?: number | string; name?: string; troopIds?: Array<number | string>; divisionIds?: Array<number | string> }) => ({
            id: Number(group.id ?? Date.now() + Math.random()),
            name: String(group.name ?? 'Grupo'),
            troopIds: normalizeGroupTroopIds(group.troopIds),
            divisionIds: normalizeGroupDivisionIds(group.divisionIds),
          })),
        )
      : []
  } catch (error) {
    console.warn('Não foi possível carregar os grupos.', error)
    groups.value = []
  }
}

function createGroupFromSelection() {
  const troopIds = [...new Set(selectedTroopIds.value)]
  const divisionIds = [...new Set(selectedDivisionIds.value)]

  if (!troopIds.length && !divisionIds.length) {
    return
  }

  const name = newGroupName.value.trim() || `${groups.value.length + 1}º Exercito`
  const nextGroup = {
    id: Date.now() + Math.random(),
    name,
    troopIds,
    divisionIds,
  }

  const groupsWithoutUnits = groups.value.map((group) => ({
    ...group,
    troopIds: group.troopIds.filter((troopId) => !troopIds.includes(troopId)),
    divisionIds: group.divisionIds.filter((divisionId) => !divisionIds.includes(divisionId)),
  }))

  const reconciledGroups = reconcileGroupMembership([
    ...groupsWithoutUnits,
    {
      ...nextGroup,
      troopIds: [...new Set(nextGroup.troopIds)],
      divisionIds: [...new Set(nextGroup.divisionIds)],
    },
  ])

  groups.value = reconciledGroups
  newGroupName.value = ''
  saveGroups()
}

function toRomanNumeral(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return ''
  }

  const romanParts: Array<{ value: number; symbol: string }> = [
    { value: 1000, symbol: 'M' },
    { value: 900, symbol: 'CM' },
    { value: 500, symbol: 'D' },
    { value: 400, symbol: 'CD' },
    { value: 100, symbol: 'C' },
    { value: 90, symbol: 'XC' },
    { value: 50, symbol: 'L' },
    { value: 40, symbol: 'XL' },
    { value: 10, symbol: 'X' },
    { value: 9, symbol: 'IX' },
    { value: 5, symbol: 'V' },
    { value: 4, symbol: 'IV' },
    { value: 1, symbol: 'I' },
  ]

  let remaining = Math.floor(value)
  let result = ''

  for (const part of romanParts) {
    while (remaining >= part.value) {
      result += part.symbol
      remaining -= part.value
    }
  }

  return result
}

function getGroupCompactLabel(group: ArmyGroup) {
  const normalizedName = String(group.name ?? '').trim()
  const numericPrefixMatch = normalizedName.match(/^(\d+)/)

  if (numericPrefixMatch) {
    const numericValue = Number(numericPrefixMatch[1])
    const roman = toRomanNumeral(numericValue)
    if (roman) {
      return roman
    }
  }

  const firstCharacter = normalizedName.charAt(0)
  if (firstCharacter) {
    return firstCharacter.toUpperCase()
  }

  return '?'
}

function undoSelectedGroup() {
  const group = selectedGroup.value
  if (!group) {
    return
  }

  groups.value = groups.value.filter((item) => item.id !== group.id)
  frontlines.value = frontlines.value.filter((frontline) => frontline.groupId !== group.id)
  saveGroups()
  saveFrontlines()

  selectedGroupId.value = null
  frontlineSelectionMode.value = false
  frontlineStartPointId.value = null
  frontlinePreviewEndPointId.value = null
  frontlineDragging.value = false
  isMovementMode.value = false
}

function getDivisionUnit(divisionId: number) {
  return troops.value.find((troop) => troop.id === divisionId && troop.military_organization === 'division') ?? null
}

function getDivisionBattalionUnits(divisionId: number) {
  return troops.value.filter((troop) => troop.parent_id === divisionId && troop.military_organization !== 'division')
}

function recalculateDivisionStats(divisionId: number) {
  const division = getDivisionUnit(divisionId)
  if (!division) {
    return
  }

  const battalions = getDivisionBattalionUnits(divisionId)
  if (!battalions.length) {
    updateTroopById(divisionId, (troop) => ({
      ...troop,
      attack: 0,
      defense: 0,
      speed: 0,
    }))
    return
  }

  const attack = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.attack ?? 0), 0) / battalions.length)
  const defense = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.defense ?? 0), 0) / battalions.length)
  const speed = Math.min(...battalions.map((battalion) => battalion.speed ?? 80))

  updateTroopById(divisionId, (troop) => ({
    ...troop,
    attack,
    defense,
    speed,
  }))
}

function deleteDivisionKeepingBattalions(divisionId: number) {
  const nextTroops: CombatTroop[] = troops.value
    .filter((troop) => troop.id !== divisionId)
    .map((troop) => {
      if (troop.parent_id !== divisionId && troop.pending_division_id !== divisionId) {
        return troop
      }

      if (movementStates.value[troop.id]) {
        stopMovementForTroop(troop.id)
      }

      return {
        ...troop,
        parent_id: null,
        pending_division_id: null,
      }
    })

  setTroops(nextTroops)

  selectedTroopIds.value = []
  selectedTroopId.value = null
  selectedDivisionIds.value = []
  selectedDivisionId.value = null
  selectedDivisionNameDraft.value = ''
}

function getNextTroopId() {
  return troops.value.reduce((maxId, troop) => Math.max(maxId, troop.id), 0) + 1
}

function createDivisionFromSelection() {
  const battalionIds = [...new Set(selectedTroopIds.value)]
  if (battalionIds.length < 2) {
    return
  }

  const battalions = battalionIds
    .map((id) => troops.value.find((troop) => troop.id === id && troop.military_organization !== 'division'))
    .filter((troop): troop is CombatTroop => troop !== undefined)

  if (battalions.length < 2) {
    return
  }

  const primaryBattalion = battalions[0]
  const primaryBattalionId = primaryBattalion.id
  const divisionPointId = primaryBattalion.pointId ?? null
  const attack = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.attack ?? 0), 0) / battalions.length)
  const defense = Math.round(battalions.reduce((sum, battalion) => sum + (battalion.defense ?? 0), 0) / battalions.length)
  const speed = Math.min(...battalions.map((battalion) => battalion.speed ?? 80))
  const divisionId = getNextTroopId()
  const divisionName = newGroupName.value.trim() || `Divisão ${divisionId}`
  const pendingBattalionIds = battalionIds.filter((id) => id !== primaryBattalionId)

  const pendingRoutes = pendingBattalionIds.map((troopId) => {
    const troop = troops.value.find((item) => item.id === troopId)
    if (!troop || troop.pointId === null || divisionPointId === null) {
      return null
    }

    const path = findShortestTraversablePath(troop, troop.pointId, divisionPointId, mapData.value?.points ?? [])
    if (path.length === 0) {
      return null
    }

    return { troop, path }
  })

  if (pendingRoutes.some((entry) => entry === null)) {
    errorMessage.value = 'Não existe rota válida para unir todos os batalhões à nova divisão.'
    return
  }

  const nextTroops: CombatTroop[] = [
    ...troops.value.map((troop) => {
      if (!battalionIds.includes(troop.id)) {
        return troop
      }

      if (troop.id === primaryBattalion.id) {
        return {
          ...troop,
          parent_id: divisionId,
          pending_division_id: null,
        }
      }

      return {
        ...troop,
        parent_id: null,
        pending_division_id: divisionId,
      }
    }),
    {
      id: divisionId,
      country: primaryBattalion.country,
      pointId: divisionPointId,
      label: divisionName,
      name: divisionName,
      attack,
      defense,
      speed,
      military_organization: 'division',
      parent_id: null,
      pending_division_id: null,
    },
  ]

  setTroops(nextTroops)

  for (const pendingRoute of pendingRoutes) {
    if (!pendingRoute) {
      continue
    }

    const { troop, path } = pendingRoute
    const currentPosition = pointMap.value.get(troop.pointId ?? -1) ?? { x: 0, y: 0 }

    movementStates.value = {
      ...movementStates.value,
      [troop.id]: {
        troopId: troop.id,
        route: path,
        segmentIndex: 0,
        traveledInSegment: 0,
        speed: troop.speed ?? 80,
        currentX: currentPosition.x,
        currentY: currentPosition.y,
        lastPointId: troop.pointId ?? divisionPointId ?? troop.pointId ?? 0,
        finalPointId: divisionPointId ?? troop.pointId ?? 0,
      },
    }
  }

  if (pendingRoutes.length > 0) {
    startMovementLoop()
  }

  selectedTroopIds.value = []
  selectedTroopId.value = divisionId
  selectedDivisionIds.value = [divisionId]
  selectedDivisionId.value = divisionId
  selectedDivisionNameDraft.value = divisionName
  newGroupName.value = ''
}

function renameSelectedDivision() {
  const division = selectedDivisionUnit.value
  if (!division || !selectedDivisionCanEdit.value) {
    return
  }

  const nextName = selectedDivisionNameDraft.value.trim()
  if (!nextName) {
    selectedDivisionNameDraft.value = division.name ?? ''
    return
  }

  updateTroopById(division.id, (troop) => ({
    ...troop,
    name: nextName,
    label: nextName,
  }))
}

function removeBattalionFromSelectedDivision(troopId: number) {
  const division = selectedDivisionUnit.value
  const battalion = troops.value.find((troop) => troop.id === troopId)

  if (!division || !battalion || battalion.parent_id !== division.id) {
    return
  }

  const battalionCount = getDivisionBattalionUnits(division.id).length

  updateTroopById(troopId, (troop) => ({
    ...troop,
    parent_id: null,
  }))

  if (battalionCount <= 1) {
    deleteDivisionKeepingBattalions(division.id)
    return
  }

  recalculateDivisionStats(division.id)
}

function addSelectedBattalionToDivision() {
  const division = selectedDivisionUnit.value
  if (!division || !selectedDivisionCanEdit.value) {
    return
  }

  const battalions = troops.value.filter((troop) => {
    if (!selectedTroopIds.value.includes(troop.id)) {
      return false
    }

    if (troop.military_organization === 'division') {
      return false
    }

    return troop.parent_id !== division.id
  })

  if (!battalions.length) {
    return
  }

  const targetPointId = division.pointId
  let hasMovement = false

  for (const battalion of battalions) {
    updateTroopById(battalion.id, (troop) => ({
      ...troop,
      parent_id: null,
      pending_division_id: division.id,
    }))

    if (targetPointId !== null && battalion.pointId !== targetPointId) {
      if (scheduleTroopMovement({ ...battalion, pending_division_id: division.id }, targetPointId, { pendingDivisionId: division.id })) {
        hasMovement = true
      }
      continue
    }

    updateTroopById(battalion.id, (troop) => ({
      ...troop,
      parent_id: division.id,
      pending_division_id: null,
      pointId: targetPointId ?? troop.pointId,
    }))
  }

  if (hasMovement) {
    startMovementLoop()
  }

  if (targetPointId !== null) {
    recalculateDivisionStats(division.id)
  }
}

function undoSelectedDivision() {
  const division = selectedDivisionUnit.value
  if (!division) {
    return
  }

  deleteDivisionKeepingBattalions(division.id)
}

function buildFrontlinePath(startId: number, endId: number) {
  const points = mapData.value?.points ?? []

  if (!isPointFrontlineEligible(startId) || !isPointFrontlineEligible(endId)) {
    return []
  }

  const eligibleIds = new Set(
    points
      .filter((point) => isPointFrontlineEligible(point.id))
      .map((point) => point.id),
  )

  const frontlineGraphPoints = points
    .filter((point) => eligibleIds.has(point.id))
    .map((point) => ({
      ...point,
      borders: (point.borders ?? []).filter((neighborId) => eligibleIds.has(neighborId)),
    }))

  return findFrontlineConstrainedPath(startId, endId, frontlineGraphPoints)
}

function getFrontlineMedianEdgeLength(points: MapPointData[]) {
  const pointById = new Map(points.map((point) => [point.id, point]))
  const lengths: number[] = []
  const seenEdges = new Set<string>()

  for (const point of points) {
    for (const neighborId of point.borders ?? []) {
      const neighbor = pointById.get(neighborId)
      if (!neighbor) {
        continue
      }

      const edgeKey = point.id < neighbor.id
        ? `${point.id}-${neighbor.id}`
        : `${neighbor.id}-${point.id}`

      if (seenEdges.has(edgeKey)) {
        continue
      }

      seenEdges.add(edgeKey)
      lengths.push(Math.hypot(neighbor.x - point.x, neighbor.y - point.y))
    }
  }

  if (!lengths.length) {
    return 0
  }

  const sorted = [...lengths].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function findFrontlinePathWithThreshold(
  startPointId: number,
  targetPointId: number,
  points: MapPointData[],
  maxEdgeLength: number,
) {
  if (startPointId === targetPointId) {
    return [startPointId]
  }

  const pointById = new Map(points.map((point) => [point.id, point]))
  const frontier: Array<{ id: number; cost: number }> = [{ id: startPointId, cost: 0 }]
  const bestCost = new Map<number, number>([[startPointId, 0]])
  const previous = new Map<number, number | null>([[startPointId, null]])

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.cost - right.cost)
    const current = frontier.shift()
    if (!current) {
      continue
    }

    if (current.id === targetPointId) {
      const path: number[] = [current.id]
      let cursor: number | null = current.id

      while (previous.get(cursor) !== null && previous.get(cursor) !== undefined) {
        const parent = previous.get(cursor)
        if (parent === null || parent === undefined) {
          break
        }
        path.unshift(parent)
        cursor = parent
      }

      return path
    }

    const currentPoint = pointById.get(current.id)
    if (!currentPoint) {
      continue
    }

    for (const neighborId of currentPoint.borders ?? []) {
      const neighbor = pointById.get(neighborId)
      if (!neighbor) {
        continue
      }

      const edgeLength = Math.hypot(neighbor.x - currentPoint.x, neighbor.y - currentPoint.y)
      if (edgeLength > maxEdgeLength) {
        continue
      }

      const candidateCost = current.cost + edgeLength
      const currentBest = bestCost.get(neighborId)

      if (currentBest !== undefined && candidateCost >= currentBest) {
        continue
      }

      bestCost.set(neighborId, candidateCost)
      previous.set(neighborId, current.id)
      frontier.push({ id: neighborId, cost: candidateCost })
    }
  }

  return []
}

function findFrontlineConstrainedPath(startPointId: number, targetPointId: number, points: MapPointData[]) {
  const medianEdgeLength = getFrontlineMedianEdgeLength(points)

  if (!Number.isFinite(medianEdgeLength) || medianEdgeLength <= 0) {
    return []
  }

  const thresholdMultipliers = [1.2, 1.35, 1.5, 1.75, 2]

  for (const multiplier of thresholdMultipliers) {
    const path = findFrontlinePathWithThreshold(
      startPointId,
      targetPointId,
      points,
      medianEdgeLength * multiplier,
    )

    if (path.length >= 2) {
      return path
    }
  }

  return []
}

function distributeFrontlineTroops(groupTroopIds: number[], pathPointIds: number[]) {
  const uniquePath = Array.from(new Set(pathPointIds))
  const assignments: Record<string, number[]> = {}

  uniquePath.forEach((pointId) => {
    assignments[String(pointId)] = []
  })

  const troopIds = [...groupTroopIds]
  const minimumSlots = Math.min(uniquePath.length, troopIds.length)

  for (let index = 0; index < minimumSlots; index += 1) {
    const pointId = uniquePath[index]
    const troopId = troopIds[index]
    if (troopId !== undefined) {
      assignments[String(pointId)] = [...(assignments[String(pointId)] ?? []), troopId]
    }
  }

  const remaining = troopIds.slice(minimumSlots)
  let index = 0

  while (remaining.length > 0) {
    const pointId = uniquePath[index % uniquePath.length]
    assignments[String(pointId)] = [...(assignments[String(pointId)] ?? []), remaining.shift() as number]
    index += 1
  }

  return assignments
}

function startFrontlineSelection() {
  if (!selectedGroup.value) {
    return
  }

  frontlineSelectionMode.value = true
  frontlineStartPointId.value = null
  frontlinePreviewEndPointId.value = null
  frontlineDragging.value = false
}

function cancelFrontlineSelection() {
  frontlineSelectionMode.value = false
  frontlineStartPointId.value = null
  frontlinePreviewEndPointId.value = null
  frontlineDragging.value = false
}

function moveGroupTroopsToFrontline(frontline: { troopAssignments: Record<string, number[]> }) {
  const points = mapData.value?.points ?? []
  const pointMapRuntime = new Map(points.map((point) => [point.id, point]))

  Object.entries(frontline.troopAssignments).forEach(([pointIdString, troopIds]) => {
    const targetPointId = Number(pointIdString)
    if (!Number.isFinite(targetPointId) || !pointMapRuntime.has(targetPointId)) {
      return
    }

    troopIds.forEach((troopId) => {
      const troop = troops.value.find((item) => item.id === troopId)
      if (!troop || troop.pointId === null) {
        return
      }

      const route = findShortestTraversablePath(troop, troop.pointId, targetPointId, points)
      if (route.length === 0) {
        return
      }

      movementStates.value = {
        ...movementStates.value,
        [troop.id]: {
          troopId: troop.id,
          route,
          segmentIndex: 0,
          traveledInSegment: 0,
          speed: troop.speed ?? 80,
          currentX: pointMapRuntime.get(troop.pointId)?.x ?? 0,
          currentY: pointMapRuntime.get(troop.pointId)?.y ?? 0,
          lastPointId: troop.pointId,
          finalPointId: targetPointId,
        },
      }
    })
  })

  if (Object.keys(movementStates.value).length > 0) {
    startMovementLoop()
  }
}

function finishFrontlineSelection() {
  if (!frontlineSelectionMode.value || frontlineStartPointId.value === null || !selectedGroup.value) {
    return
  }

  const endPointId = frontlinePreviewEndPointId.value ?? frontlineStartPointId.value
  const pathPointIds = buildFrontlinePath(frontlineStartPointId.value, endPointId)
  const groupId = selectedGroup.value.id
  const normalizedGroupId = Number(groupId)

  if (pathPointIds.length < 2) {
    cancelFrontlineSelection()
    return
  }

  const createdLine = {
    id: Date.now() + Math.random(),
    groupId,
    name: selectedGroup.value.name,
    startPointId: frontlineStartPointId.value,
    endPointId: endPointId,
    pathPointIds,
    troopAssignments: distributeFrontlineTroops(getGroupFrontlineUnitIds(selectedGroup.value), pathPointIds),
  }

  frontlines.value = [
    ...frontlines.value.filter((frontline) => Number(frontline.groupId) !== normalizedGroupId),
    createdLine,
  ]
  saveFrontlines()
  moveGroupTroopsToFrontline(createdLine)
  cancelFrontlineSelection()
}

function selectGroup(groupId: number) {
  const group = groups.value.find((item) => item.id === groupId)
  if (!group) {
    return
  }

  const resolvedTroops = getGroupResolvedBattalionIds(group)
  if (!resolvedTroops.length) {
    return
  }

  selectedTroopIds.value = [...group.troopIds]
  selectedTroopId.value = resolvedTroops[0] ?? null
  selectedDivisionIds.value = [...group.divisionIds]
  selectedDivisionId.value = group.divisionIds[0] ?? null
  selectedGroupId.value = group.id
  isMovementMode.value = false
  errorMessage.value = ''
}

async function loadLocalTestData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [countriesResponse, mapResponse, troopsResponse, playerResponse, visualResponse] = await Promise.all([
      fetch('/teste/countries.json'),
      fetch('/teste/map.json'),
      fetch('/teste/troops.json'),
      fetch('/teste/player.json'),
      fetch('/teste/visual.json'),
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

    if (!playerResponse.ok) {
      throw new Error(`player.json falhou: ${playerResponse.status}`)
    }

    const countriesData = await countriesResponse.json()
    const mapDataPayload = await mapResponse.json()
    const troopsData = await troopsResponse.json()
    const playerData = await playerResponse.json()
    const visualData = visualResponse.ok ? await visualResponse.json() : null

    const loadedCountries = Array.isArray(countriesData)
      ? countriesData
      : (countriesData?.countries ?? [])

    countryNames.value = Object.fromEntries(
      loadedCountries.map((country: { id?: number | string; name?: string }) => [String(country.id ?? ''), country.name ?? 'Desconhecido']),
    )

    const playerEntry = Array.isArray(playerData) ? playerData[0] : (playerData ?? {})
    const playerCountry = Number(playerEntry?.country ?? playerEntry?.controlledCountry ?? 1)
    controlledCountryId.value = Number.isFinite(playerCountry) ? playerCountry : 1

    const normalizedMap = normalizeMapJson(mapDataPayload)
    mapData.value = normalizedMap
    visualMapData.value = normalizeVisualMap(visualData)

    const rawTroops = Array.isArray(troopsData)
      ? troopsData
      : (troopsData?.troops ?? [])

    troops.value = rawTroops.map((troop: any, index: number) => ({
      id: Number(troop.id ?? index + 1),
      country: troop.country === 'red' ? 'red' : 'blue',
      pointId: troop.pointId ?? troop.point_id ?? null,
      label: troop.label ?? troop.name ?? `Unidade ${index + 1}`,
      speed: Number(troop.speed ?? 80),
      attack: Number(troop.attack ?? 0),
      defense: Number(troop.defense ?? 0),
      military_organization: troop.military_organization === 'division' ? 'division' : 'battalion',
      parent_id: troop.parent_id === null || troop.parent_id === undefined || troop.parent_id === ''
        ? null
        : Number(troop.parent_id),
      pending_division_id: troop.pending_division_id === null || troop.pending_division_id === undefined || troop.pending_division_id === ''
        ? null
        : Number(troop.pending_division_id),
    }))

    if (loadedCountries.length > 0) {
      console.info('Countries carregadas:', loadedCountries.length)
    }

    resetTroopsForMap()
  } catch (error) {
    mapData.value = null
    visualMapData.value = null
    troops.value = []
    divisions.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Erro ao carregar os dados locais de teste.'
  } finally {
    isLoading.value = false
  }
}

function clearTroopSelection() {
  selectedTroopIds.value = []
  selectedTroopId.value = null
  selectedDivisionIds.value = []
  selectedDivisionId.value = null
  selectedGroupId.value = null
  isMovementMode.value = false
  errorMessage.value = ''
}

function selectTroop(troopId: number, event?: MouseEvent) {
  const troop = troops.value.find((item) => item.id === troopId)
  if (!troop || troopCountryToId[troop.country] !== controlledCountryId.value) {
    return
  }

  if (event?.ctrlKey || event?.metaKey) {
    const isSelected = selectedTroopIds.value.includes(troopId)
    selectedTroopIds.value = isSelected
      ? selectedTroopIds.value.filter((id) => id !== troopId)
      : [...selectedTroopIds.value, troopId]

    selectedGroupId.value = null
    selectedTroopId.value = selectedTroopIds.value[0] ?? selectedDivisionIds.value[0] ?? null
    if (!selectedTroopIds.value.length && !selectedDivisionIds.value.length) {
      selectedDivisionId.value = null
    }
    isMovementMode.value = false
    errorMessage.value = ''
    return
  }

  if (selectedTroopIds.value.includes(troopId) && selectedTroopId.value === troopId) {
    clearTroopSelection()
    return
  }

  selectedDivisionIds.value = []
  selectedDivisionId.value = null
  selectedTroopIds.value = [troopId]
  selectedTroopId.value = troopId

  selectedGroupId.value = null
  isMovementMode.value = false
  errorMessage.value = ''
}

function selectDivision(divisionId: number, event?: MouseEvent) {
  const division = divisionLookup.value.get(divisionId)
  if (!division) {
    return
  }

  if (event?.ctrlKey || event?.metaKey) {
    const isSelected = selectedDivisionIds.value.includes(divisionId)
    selectedDivisionIds.value = isSelected
      ? selectedDivisionIds.value.filter((id) => id !== divisionId)
      : [...selectedDivisionIds.value, divisionId]

    selectedDivisionId.value = selectedDivisionIds.value[0] ?? null
    selectedTroopId.value = selectedDivisionIds.value[0] ?? selectedTroopIds.value[0] ?? null
    selectedGroupId.value = null
    isMovementMode.value = false
    errorMessage.value = ''

    return
  }

  selectedTroopIds.value = []
  selectedDivisionIds.value = [divisionId]
  selectedDivisionId.value = divisionId
  selectedTroopId.value = division.id
  selectedGroupId.value = null
  isMovementMode.value = false
  errorMessage.value = ''
}

function startMovementMode() {
  const activeTroops = getSelectionMovementTroops()
  if (!activeTroops.length) {
    return
  }

  const hasInvalidTroop = activeTroops.some((troop) => troopCountryToId[troop.country] !== controlledCountryId.value)
  if (hasInvalidTroop) {
    errorMessage.value = 'Você só pode mover tropas do país que controla.'
    return
  }

  isMovementMode.value = true
}

function stopMovementLoop() {
  if (movementTimer !== null) {
    window.clearInterval(movementTimer)
    movementTimer = null
  }

  movementStates.value = {}
  movementRoute.value = []
}

function stopMovementForTroop(troopId: number) {
  const nextStates = { ...movementStates.value }
  delete nextStates[troopId]
  movementStates.value = nextStates

  if (Object.keys(nextStates).length === 0 && movementTimer !== null) {
    window.clearInterval(movementTimer)
    movementTimer = null
  }
}

function startMovementLoop() {
  if (movementTimer !== null) {
    return
  }

  movementTimer = window.setInterval(() => {
    const activeTroopIds = Object.keys(movementStates.value).map(Number)
    for (const troopId of activeTroopIds) {
      advanceAlongRoute(troopId)
    }
  }, 16)
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

function resolveTroopArrival(troop: CombatTroop, pointId: number) {
  updateTroopById(troop.id, (item) => ({
    ...item,
    pointId,
    pending_division_id: item.pending_division_id ?? null,
  }))

  if (isDivision(troop)) {
    syncDivisionBattalionPositions(troop.id, pointId)
  }

  if (troop.pending_division_id !== null && troop.pending_division_id !== undefined) {
    const division = troops.value.find((item) => item.id === troop.pending_division_id && item.military_organization === 'division')
    if (division && division.pointId === pointId) {
      updateTroopById(troop.id, (item) => ({
        ...item,
        pointId,
        parent_id: division.id,
        pending_division_id: null,
      }))
      recalculateDivisionStats(division.id)
    }
  }
}

function advanceAlongRoute(troopId: number) {
  const movement = movementStates.value[troopId]
  const troop = troops.value.find((item) => item.id === troopId)

  if (!movement || !troop) {
    stopMovementForTroop(troopId)
    return
  }

  const route = movement.route
  const points = mapData.value?.points ?? []
  const pointMapRuntime = new Map(points.map((point) => [point.id, point]))

  if (route.length < 2 || movement.segmentIndex >= route.length - 1) {
    resolveTroopArrival(troop, movement.finalPointId)

    if (selectedTroopId.value === troop.id) {
      destinationPointId.value = movement.finalPointId
    }

    stopMovementForTroop(troopId)
    if (selectedTroopId.value === troop.id) {
      isMovementMode.value = false
      errorMessage.value = ''
    }
    return
  }

  const currentPoint = pointMapRuntime.get(route[movement.segmentIndex])
  const nextPoint = pointMapRuntime.get(route[movement.segmentIndex + 1])

  if (!currentPoint || !nextPoint) {
    stopMovementForTroop(troopId)
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

    resolveTroopArrival(troop, nextRoutePointId)

    claimProvinceIfNeutral(troop, nextRoutePointId)

    const nextMovement = {
      ...movement,
      segmentIndex: nextSegmentIndex,
      traveledInSegment: 0,
      currentX: nextX,
      currentY: nextY,
      lastPointId: nextRoutePointId,
    }

    movementStates.value = {
      ...movementStates.value,
      [troop.id]: nextMovement,
    }

    if (nextRoutePointId === movement.finalPointId) {
      if (selectedTroopId.value === troop.id) {
        destinationPointId.value = movement.finalPointId
      }
      stopMovementForTroop(troopId)
      if (selectedTroopId.value === troop.id) {
        isMovementMode.value = false
        errorMessage.value = ''
      }
      return
    }

    return
  }

  const ratio = nextTravel / segmentLength
  nextX = currentPoint.x + (nextPoint.x - currentPoint.x) * ratio
  nextY = currentPoint.y + (nextPoint.y - currentPoint.y) * ratio

  movementStates.value = {
    ...movementStates.value,
    [troop.id]: {
      ...movement,
      traveledInSegment: nextTravel,
      currentX: nextX,
      currentY: nextY,
    },
  }
}

function moveSelectedTroop(targetPointId: number | null = destinationPointId.value) {
  if (targetPointId !== null && !isCenterPoint(targetPointId)) {
    errorMessage.value = 'Esta província só pode ser usada como transição, não como destino final.'
    return
  }

  const selectedTroopsForMovement = getSelectionMovementTroops()

  if (!selectedTroopsForMovement.length || targetPointId === null) {
    return
  }

  const invalidTroop = selectedTroopsForMovement.find((troop) => troopCountryToId[troop.country] !== controlledCountryId.value)
  if (invalidTroop) {
    errorMessage.value = 'Você só pode mover tropas do país que controla.'
    return
  }

  const routesByTroop = new Map<number, number[]>()

  for (const troop of selectedTroopsForMovement) {
    if (troop.pointId === null) {
      continue
    }

    const path = findShortestTraversablePath(troop, troop.pointId, targetPointId, mapData.value?.points ?? [])
    if (path.length === 0) {
      errorMessage.value = 'Não existe rota válida até esse ponto sem passar por território inimigo.'
      return
    }

    routesByTroop.set(troop.id, path)
  }

  if (routesByTroop.size === 0) {
    return
  }

  const activeTroops = selectedTroopsForMovement
  if (!activeTroops.length) {
    return
  }

  for (const troop of activeTroops) {
    const route = routesByTroop.get(troop.id)
    if (!route || troop.pointId === null) {
      continue
    }

    if (isDivision(troop)) {
      cancelPendingJoinForDivision(troop.id)
    } else if (troop.pending_division_id !== null && troop.pending_division_id !== undefined) {
      updateTroopById(troop.id, (item) => ({
        ...item,
        pending_division_id: troop.pending_division_id,
      }))
    }

    const startPoint = pointMap.value.get(troop.pointId)
    const currentPosition = startPoint ?? { x: 0, y: 0 }

    movementStates.value = {
      ...movementStates.value,
      [troop.id]: {
        troopId: troop.id,
        route,
        segmentIndex: 0,
        traveledInSegment: 0,
        speed: troop.speed ?? 80,
        currentX: currentPosition.x,
        currentY: currentPosition.y,
        lastPointId: troop.pointId,
        finalPointId: targetPointId,
      },
    }

    startMovementLoop()

    if (route.length <= 2) {
      const finalPoint = pointMap.value.get(targetPointId)
      if (finalPoint) {
        movementStates.value = {
          ...movementStates.value,
          [troop.id]: {
            troopId: troop.id,
            route,
            segmentIndex: 0,
            traveledInSegment: 0,
            speed: troop.speed ?? 80,
            currentX: finalPoint.x,
            currentY: finalPoint.y,
            lastPointId: troop.pointId,
            finalPointId: targetPointId,
          },
        }
      }

      claimProvinceIfNeutral(troop, targetPointId)
      advanceAlongRoute(troop.id)
    }
  }

  movementRoute.value = Array.from(routesByTroop.values())[0] ?? []
  destinationPointId.value = targetPointId
  isMovementMode.value = false
}

function handleMapPointMouseEnter(pointId: number) {
  if (frontlineSelectionMode.value && frontlineDragging.value && frontlineStartPointId.value !== null) {
    if (isPointFrontlineEligible(pointId)) {
      frontlinePreviewEndPointId.value = pointId
    }
    return
  }

  if (!selectedTroop.value || !isMovementMode.value) {
    return
  }

  hoveredDestinationId.value = pointId
}

function handleBoardMouseMove(event: MouseEvent) {
  continuePanDrag(event)

  if (isPanningMap.value) {
    return
  }

  if (frontlineSelectionMode.value && frontlineDragging.value && frontlineStartPointId.value !== null) {
    const resolvedPointId = resolvePointIdFromMouseEvent(event)
    if (resolvedPointId !== null && isPointFrontlineEligible(resolvedPointId)) {
      frontlinePreviewEndPointId.value = resolvedPointId
    }
    return
  }

  if (!isMovementMode.value || !hasUnitSelection.value) {
    return
  }

  const resolvedPointId = resolvePointIdFromMouseEvent(event)
  if (resolvedPointId === null) {
    hoveredDestinationId.value = null
    return
  }

  hoveredDestinationId.value = resolvedPointId
}

function handleBoardClick(event: MouseEvent) {
  if (suppressBoardClick.value) {
    suppressBoardClick.value = false
    return
  }

  const target = event.target as HTMLElement | null
  if (target?.closest('circle')) {
    return
  }

  const resolvedPointId = resolvePointIdFromMouseEvent(event)
  if (resolvedPointId === null) {
    return
  }

  handleMapPointClick(resolvedPointId)
}

function handleBoardMouseUp() {
  finishPanDrag()
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
  if (frontlineSelectionMode.value) {
    if (!isPointFrontlineEligible(pointId)) {
      return
    }

    if (frontlineStartPointId.value === null) {
      frontlineStartPointId.value = pointId
      frontlinePreviewEndPointId.value = pointId
      frontlineDragging.value = true
      return
    }

    frontlinePreviewEndPointId.value = pointId
    finishFrontlineSelection()
    return
  }

  if (isMovementMode.value && !isCenterPoint(pointId)) {
    errorMessage.value = 'Só é possível mover para uma província central.'
    return
  }

  if (!hasUnitSelection.value) {
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

function setZoom(
  nextZoom: number,
  anchor: { svgX: number; svgY: number; worldX: number; worldY: number } | null = null,
) {
  const clampedNextZoom = Math.min(20, Math.max(0.25, Number(nextZoom) || 1))

  if (!anchor) {
    zoom.value = clampedNextZoom
    return
  }

  const width = boardWidth.value
  const height = boardHeight.value

  panX.value = anchor.svgX - anchor.worldX * clampedNextZoom - (width - width / clampedNextZoom) / 2
  panY.value = anchor.svgY - anchor.worldY * clampedNextZoom - (height - height / clampedNextZoom) / 2
  zoom.value = clampedNextZoom
}

function getScreenToSvgScale(target: HTMLElement) {
  const svgNode = target.querySelector('.board-svg') as SVGSVGElement | null
  const svgRect = svgNode?.getBoundingClientRect()

  if (!svgRect || svgRect.width <= 0 || svgRect.height <= 0) {
    return { x: 1, y: 1 }
  }

  return {
    x: boardWidth.value / svgRect.width,
    y: boardHeight.value / svgRect.height,
  }
}

function startPanDrag(event: MouseEvent) {
  if (event.button !== 0 || frontlineSelectionMode.value || event.ctrlKey || event.metaKey) {
    return
  }

  const target = event.target as HTMLElement | null
  if (target && target.closest('circle')) {
    return
  }

  isPanningMap.value = true
  didPanMap.value = false
  panDragStart.value = { x: event.clientX, y: event.clientY }
  panInitialOffset.value = { x: panX.value, y: panY.value }
}

function continuePanDrag(event: MouseEvent) {
  if (!isPanningMap.value || !panDragStart.value || !panInitialOffset.value) {
    return
  }

  const target = event.currentTarget as HTMLElement
  const deltaX = event.clientX - panDragStart.value.x
  const deltaY = event.clientY - panDragStart.value.y
  const scale = getScreenToSvgScale(target)

  panX.value = panInitialOffset.value.x + deltaX * scale.x
  panY.value = panInitialOffset.value.y + deltaY * scale.y

  if (Math.hypot(deltaX, deltaY) > 3) {
    didPanMap.value = true
    hoveredDestinationId.value = null
  }
}

function finishPanDrag() {
  if (!isPanningMap.value) {
    return
  }

  isPanningMap.value = false
  panDragStart.value = null
  panInitialOffset.value = null

  if (didPanMap.value) {
    suppressBoardClick.value = true
  }
}

function onWheelZoom(event: WheelEvent) {
  event.preventDefault()

  const worldPoint = getWorldPointFromMouseEvent(event)
  const svgPoint = getSvgPointFromMouseEvent(event)
  const direction = event.deltaY < 0 ? 1.15 : 0.85
  const nextZoom = zoom.value * direction

  if (svgPoint) {
    setZoom(nextZoom, {
      svgX: svgPoint.x,
      svgY: svgPoint.y,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    })
    return
  }

  setZoom(nextZoom)
}

onMounted(() => {
  void loadFrontlines()
  void loadGroups()
  void loadLocalTestData()
})

onBeforeUnmount(() => {
  stopMovementLoop()
})
</script>

<template>
  <main class="combat-test-shell">
    <div v-if="errorMessage" class="status error">
      {{ errorMessage }}
    </div>

    <div v-if="isLoading" class="status">
      Carregando mapa...
    </div>

    <div v-else-if="mapData && (mapData.points ?? []).length" class="map-stage">
      <div
        class="board-wrap"
        :class="{ 'frontline-active': frontlineSelectionMode }"
        @wheel="onWheelZoom"
        @mousedown="startPanDrag"
        @mousemove="handleBoardMouseMove"
        @click="handleBoardClick"
        @mouseup="handleBoardMouseUp"
        @mouseleave="handleBoardMouseUp"
      >
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
                :stroke="segment.color"
                stroke-width="1.2"
                stroke-dasharray="4 6"
                opacity="0.55"
                class="route-preview-line"
              />
            </g>

            <g v-if="frontlinePreviewSegments.length" class="frontline-preview-layer">
              <line
                v-for="segment in frontlinePreviewSegments"
                :key="segment.key"
                :x1="segment.x1"
                :y1="segment.y1"
                :x2="segment.x2"
                :y2="segment.y2"
                stroke="#fbbf24"
                stroke-width="4"
                stroke-dasharray="8 8"
                stroke-linecap="round"
                opacity="0.95"
              />
            </g>

            <g v-if="frontlineSegments.length" class="frontline-layer">
              <line
                v-for="segment in frontlineSegments"
                :key="segment.key"
                :x1="segment.x1"
                :y1="segment.y1"
                :x2="segment.x2"
                :y2="segment.y2"
                stroke="#fbbf24"
                stroke-width="5"
                stroke-linecap="round"
                opacity="0.9"
              />
            </g>

            <g v-if="visualProvincePolygons.length" class="visual-provinces-layer">
              <polygon
                v-for="province in visualProvincePolygons"
                :key="`visual-province-${province.id}`"
                :points="province.points"
                :fill="province.fill"
                stroke="#0f172a"
                stroke-width="1.2"
                opacity="0.36"
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
                stroke-width="1"
                stroke-linecap="round"
                opacity="0.45"
              />
            </g>

            <g class="points-layer">
              <circle
                v-for="point in visibleMapPoints"
                :key="point.id"
                :cx="point.x"
                :cy="point.y"
                :r="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 3.2 : hoveredDestinationId === point.id && isMovementMode ? 2.9 : 2.1"
                fill="#020617"
                stroke="#f8fafc"
                :stroke-width="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 1.2 : hoveredDestinationId === point.id && isMovementMode ? 1.1 : 0.7"
                :opacity="frontlineSelectionMode ? (isPointFrontlineEligible(point.id) ? 0.95 : 0.16) : hoveredDestinationId === point.id && isMovementMode ? 0.95 : 0.72"
                :filter="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 'drop-shadow(0 0 5px rgba(251, 191, 36, 0.85))' : undefined"
                @mouseenter="handleMapPointMouseEnter(point.id)"
                @mouseleave="handleMapPointMouseLeave(point.id)"
                @click="handleMapPointClick(point.id)"
              />

              <g v-for="division in divisionRenderItems" :key="`division-${division.id}`">
                <circle
                  :cx="division.x"
                  :cy="division.y"
                  r="10"
                  :fill="selectedDivisionIds.includes(division.id) ? '#f59e0b' : '#fbbf24'"
                  :stroke="selectedDivisionIds.includes(division.id) ? '#f8fafc' : '#78350f'"
                  stroke-width="2"
                  opacity="0.92"
                  @click.stop="selectDivision(division.id, $event)"
                  @mousedown.stop
                />
                <text
                  :x="division.x + 12"
                  :y="division.y + 4"
                  font-size="10"
                  font-weight="700"
                  fill="#fde68a"
                >
                  D{{ division.id }}
                </text>
              </g>

              <g v-for="troop in visibleBattalionTroops" :key="troop.id">
                <circle
                  :cx="getTroopRenderPosition(troop).x"
                  :cy="getTroopRenderPosition(troop).y"
                  r="6.5"
                  :fill="troop.country === 'blue' ? '#3b82f6' : '#ef4444'"
                  :stroke="selectedTroopIds.includes(troop.id) || selectedTroopId === troop.id ? '#f8fafc' : '#0f172a'"
                  stroke-width="2.5"
                  :stroke-dasharray="troop.pending_division_id ? '4 3' : undefined"
                  @click.stop="selectTroop(troop.id, $event)"
                  @mousedown.stop
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

              <g v-for="indicator in stackedProvinceIndicators" :key="`stack-${indicator.pointId}`" class="troop-stack-indicator">
                <circle
                  :cx="indicator.x + 16"
                  :cy="indicator.y - 16"
                  r="8"
                  fill="#0f172a"
                  stroke="#f8fafc"
                  stroke-width="1.2"
                  opacity="0.9"
                />
                <text
                  :x="indicator.x + 16"
                  :y="indicator.y - 13"
                  font-size="10"
                  font-weight="700"
                  text-anchor="middle"
                  fill="#f8fafc"
                >
                  {{ indicator.count }}
                </text>
              </g>
            </g>
          </g>
        </svg>
      </div>

      <aside v-if="selectedTroopIds.length || selectedDivisionIds.length" class="selection-panel">
        <div class="panel-header">
          <h3>Unidades</h3>
          <button type="button" class="close-button" aria-label="Fechar seleção" @click="clearTroopSelection">×</button>
        </div>
        <div v-if="selectedDivisionCanEdit" class="division-edit-box">
          <label for="division-name">Nome da divisão</label>
          <input
            id="division-name"
            v-model="selectedDivisionNameDraft"
            placeholder="Nome da divisão"
            maxlength="60"
            @input="renameSelectedDivision"
          />

          <div class="division-actions-row">
            <button type="button" class="action-button secondary-button" @click="undoSelectedDivision">
              Desfazer divisão
            </button>
            <button v-if="selectedBattalionToAddToDivision" type="button" class="action-button" @click="addSelectedBattalionToDivision">
              Adicionar à divisão
            </button>
          </div>

          <ul class="division-battalion-list">
            <li v-for="battalion in selectedDivisionBattalions" :key="`div-battalion-${battalion.id}`">
              <span>{{ battalion.label }}</span>
              <button type="button" class="remove-link-button" @click="removeBattalionFromSelectedDivision(battalion.id)">
                Remover
              </button>
            </li>
          </ul>
        </div>
        <ul v-if="selectedLooseBattalionTroops.length">
          <li v-for="troop in selectedLooseBattalionTroops" :key="troop.id">
            {{ troop.label }}
          </li>
        </ul>

      </aside>

      <aside v-if="groupsForPlayer.length || selectedTroopIds.length + selectedDivisionIds.length > 0" class="groups-panel">
        <ul>
          <li
            class="group-item group-create-item"
            :class="{ 'group-create-disabled': selectedTroopIds.length + selectedDivisionIds.length === 0 }"
            @click="createGroupFromSelection"
          >
            <span class="group-compact-label">+</span>
          </li>
          <li v-for="group in groupsForPlayer" :key="group.id" class="group-item group-selectable" @click="selectGroup(group.id)">
            <span class="group-compact-label">{{ getGroupCompactLabel(group) }}</span>
          </li>
        </ul>

        <div v-if="selectedGroup" class="group-actions-row">
          <button type="button" class="action-button secondary-button" @click="undoSelectedGroup">
            Desfazer grupo
          </button>
        </div>
      </aside>

      <TroopSelectionPanel
        v-if="selectedTroop"
        :troop="selectedTroop"
        :group-name="selectedGroup?.name ?? null"
        :selection-count="selectedDivisionUnit ? selectedDivisionBattalions.length : selectedTroopIds.length"
        :is-movement-mode="isMovementMode"
        @move="startMovementMode"
        @frontline="startFrontlineSelection"
        @create-division="createDivisionFromSelection"
        @cancel-join="cancelPendingJoinForTroop(selectedTroop.id)"
        @close="clearTroopSelection"
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

.board-wrap.frontline-active {
  cursor: crosshair;
}

.board-wrap:active {
  cursor: grabbing;
}

.board-wrap.frontline-active:active {
  cursor: crosshair;
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

.selection-panel {
  position: absolute;
  left: 1.5rem;
  top: 1.5rem;
  z-index: 26;
  width: min(260px, 28vw);
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.45);
  pointer-events: auto;
}

.selection-panel .panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.selection-panel h3 {
  margin: 0;
  font-size: 1rem;
  color: #f8fafc;
}

.selection-panel .close-button {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(30, 41, 59, 0.9);
  color: #f8fafc;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.selection-panel .close-button:hover {
  border-color: rgba(96, 165, 250, 0.7);
  background: rgba(30, 64, 175, 0.35);
}

.selection-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.selection-panel li {
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.division-edit-box {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.9rem;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.division-edit-box label {
  font-size: 0.78rem;
  color: #cbd5e1;
}

.division-edit-box input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  box-sizing: border-box;
}

.division-actions-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.division-battalion-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.division-battalion-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.remove-link-button {
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
  border-radius: 10px;
  padding: 0.45rem 0.7rem;
  cursor: pointer;
  font-weight: 700;
}

.group-create-box {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.9rem;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.group-create-box label {
  font-size: 0.78rem;
  color: #cbd5e1;
}

.group-create-box input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  box-sizing: border-box;
}

.group-button {
  width: 100%;
}

.group-actions-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.groups-panel {
  position: absolute;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  z-index: 26;
  width: fit-content;
  max-width: 90vw;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.45);
  pointer-events: auto;
}

.groups-panel h3 {
  margin: 0;
  font-size: 1rem;
  color: #f8fafc;
}

.groups-panel ul {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
  gap: 0.5rem;
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.group-create-item {
  cursor: pointer;
  border-style: dashed;
  border-color: rgba(96, 165, 250, 0.65);
  background: rgba(30, 64, 175, 0.2);
}

.group-create-item:hover {
  border-color: rgba(125, 211, 252, 0.9);
  background: rgba(30, 64, 175, 0.32);
}

.group-create-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.group-create-disabled:hover {
  border-color: rgba(96, 165, 250, 0.65);
  background: rgba(30, 64, 175, 0.2);
}

.group-selectable {
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.group-selectable:hover {
  border-color: rgba(96, 165, 250, 0.7);
  transform: translateY(-1px);
}

.group-compact-label {
  color: #f8fafc;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.02em;
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

.province-label {
  pointer-events: none;
  user-select: none;
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
