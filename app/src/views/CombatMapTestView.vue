<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TroopSelectionPanel from '../components/game/TroopSelectionPanel.vue'
import { buildBorderSegments, normalizeMapJson, type MapJsonData } from '../utils/mapData'
import {
  findShortestPath,
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
const controlledCountryId = ref<number | null>(null)
const selectedTroopIds = ref<number[]>([])
const selectionStart = ref<{ x: number; y: number } | null>(null)
const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const selectedProvince = ref<{ id: number; name: string; owner: string } | null>(null)
const groups = ref<Array<{ id: number; name: string; troopIds: number[] }>>([])
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

function canTroopTraversePath(troop: CombatTroop, path: number[]) {
  return path.every((pointId, index) => {
    if (index === 0) {
      return true
    }

    return canTroopEnterPoint(troop, pointId)
  })
}

const borderSegments = computed(() => {
  return buildBorderSegments(mapData.value?.points ?? [])
})

const pointMap = computed(() => new Map((mapData.value?.points ?? []).map((point) => [point.id, point])))

const selectedTroop = computed(() => troops.value.find((troop) => troop.id === selectedTroopId.value) ?? null)
const selectedTroopsList = computed(() => troops.value.filter((troop) => selectedTroopIds.value.includes(troop.id)))
const troopLookup = computed(() => new Map(troops.value.map((troop) => [troop.id, troop])))
const selectedGroup = computed(() => groups.value.find((group) => group.id === selectedGroupId.value) ?? null)
const groupsForPlayer = computed(() => groups.value.filter((group) => group.troopIds.some((troopId) => troopLookup.value.has(troopId))))
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

const selectionBoxStyle = computed(() => {
  if (!selectionRect.value) {
    return null
  }

  return {
    left: `${selectionRect.value.x}px`,
    top: `${selectionRect.value.y}px`,
    width: `${selectionRect.value.width}px`,
    height: `${selectionRect.value.height}px`,
  }
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
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
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

  const activeTroops = selectedTroopIds.value.length
    ? selectedTroopsList.value
    : (selectedTroop.value ? [selectedTroop.value] : [])

  const pointMapPreview = new Map(points.map((point) => [point.id, point]))
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; color: string }> = []

  for (const troop of activeTroops) {
    if (troop.pointId === null) {
      continue
    }

    const route = findShortestPath(troop.pointId, hoverTargetId, points)
    if (route.length < 2 || !canTroopTraversePath(troop, route)) {
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

function isPointFrontlineEligible(pointId: number | null) {
  if (pointId === null) {
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
}

function normalizeGroupTroopIds(troopIds: Array<number | string> | undefined) {
  return Array.from(new Set(
    (troopIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
  ))
}

function reconcileGroupMembership(groupList: Array<{ id: number; name: string; troopIds: number[] }>) {
  const troopToGroup = new Map<number, number>()

  const normalized = groupList.map((group) => ({
    ...group,
    troopIds: normalizeGroupTroopIds(group.troopIds),
  }))

  const nextGroups: Array<{ id: number; name: string; troopIds: number[] }> = []

  for (const group of normalized) {
    const refinedTroopIds: number[] = []

    for (const troopId of group.troopIds) {
      if (troopToGroup.has(troopId)) {
        continue
      }

      troopToGroup.set(troopId, group.id)
      refinedTroopIds.push(troopId)
    }

    nextGroups.push({
      ...group,
      troopIds: refinedTroopIds,
    })
  }

  return nextGroups.filter((group) => group.troopIds.length > 0)
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
            parsedGroups.map((group: { id?: number | string; name?: string; troopIds?: Array<number | string> }) => ({
              id: Number(group.id ?? Date.now() + Math.random()),
              name: String(group.name ?? 'Grupo'),
              troopIds: normalizeGroupTroopIds(group.troopIds),
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
          parsedGroups.map((group: { id?: number | string; name?: string; troopIds?: Array<number | string> }) => ({
            id: Number(group.id ?? Date.now() + Math.random()),
            name: String(group.name ?? 'Grupo'),
            troopIds: normalizeGroupTroopIds(group.troopIds),
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
  if (!troopIds.length) {
    return
  }

  const name = newGroupName.value.trim() || `Grupo ${groups.value.length + 1}`
  const nextGroup = {
    id: Date.now() + Math.random(),
    name,
    troopIds,
  }

  const groupsWithoutTroops = groups.value.map((group) => ({
    ...group,
    troopIds: group.troopIds.filter((troopId) => !troopIds.includes(troopId)),
  }))

  const reconciledGroups = reconcileGroupMembership([
    ...groupsWithoutTroops,
    {
      ...nextGroup,
      troopIds: [...new Set(nextGroup.troopIds)],
    },
  ])

  groups.value = reconciledGroups
  newGroupName.value = ''
  saveGroups()
}

function buildFrontlinePath(startId: number, endId: number) {
  const points = mapData.value?.points ?? []
  const route = findShortestPath(startId, endId, points)
  return route.length > 0 ? route : [startId, endId]
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

      const route = findShortestPath(troop.pointId, targetPointId, points)
      if (route.length === 0 || !canTroopTraversePath(troop, route)) {
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

  if (pathPointIds.length < 2) {
    cancelFrontlineSelection()
    return
  }

  const createdLine = {
    id: Date.now() + Math.random(),
    groupId: selectedGroup.value.id,
    name: selectedGroup.value.name,
    startPointId: frontlineStartPointId.value,
    endPointId: endPointId,
    pathPointIds,
    troopAssignments: distributeFrontlineTroops(selectedGroup.value.troopIds, pathPointIds),
  }

  frontlines.value = [...frontlines.value, createdLine]
  saveFrontlines()
  moveGroupTroopsToFrontline(createdLine)
  cancelFrontlineSelection()
}

function selectGroup(groupId: number) {
  const group = groups.value.find((item) => item.id === groupId)
  if (!group || !group.troopIds.length) {
    return
  }

  selectedTroopIds.value = [...group.troopIds]
  selectedTroopId.value = group.troopIds[0] ?? null
  selectedGroupId.value = group.id
  isMovementMode.value = false
  errorMessage.value = ''
}

async function loadLocalTestData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [countriesResponse, mapResponse, troopsResponse, playerResponse] = await Promise.all([
      fetch('/teste/countries.json'),
      fetch('/teste/map.json'),
      fetch('/teste/troops.json'),
      fetch('/teste/player.json'),
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

function clearTroopSelection() {
  selectedTroopIds.value = []
  selectedTroopId.value = null
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
    selectedTroopId.value = selectedTroopIds.value[0] ?? null
    isMovementMode.value = false
    errorMessage.value = ''
    return
  }

  if (selectedTroopIds.value.includes(troopId) && selectedTroopId.value === troopId) {
    clearTroopSelection()
    return
  }

  selectedTroopIds.value = [troopId]
  selectedTroopId.value = troopId
  selectedGroupId.value = null
  isMovementMode.value = false
  errorMessage.value = ''
}

function startMovementMode() {
  const troop = selectedTroop.value
  if (!troop || troopCountryToId[troop.country] !== controlledCountryId.value) {
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
    troops.value = troops.value.map((item) => {
      if (item.id !== troop.id) {
        return item
      }

      return {
        ...item,
        pointId: movement.finalPointId,
      }
    })

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
  const selectedIds = selectedTroopIds.value.length
    ? [...selectedTroopIds.value]
    : (selectedTroopId.value !== null ? [selectedTroopId.value] : [])

  const troopsToMove = selectedIds
    .map((troopId) => troops.value.find((troop) => troop.id === troopId))
    .filter((troop): troop is CombatTroop => troop !== undefined)

  if (!troopsToMove.length || targetPointId === null) {
    return
  }

  const invalidTroop = troopsToMove.find((troop) => troopCountryToId[troop.country] !== controlledCountryId.value)
  if (invalidTroop) {
    errorMessage.value = 'Você só pode mover tropas do país que controla.'
    return
  }

  const points = mapData.value?.points ?? []
  const routesByTroop = new Map<number, number[]>()
  const occupancyCheck = new Set<number>()

  for (const troop of troopsToMove) {
    if (troop.pointId === null) {
      continue
    }

    if (occupancyCheck.has(troop.id)) {
      continue
    }

    const occupiedByOthers = troops.value.some(
      (other) => other.id !== troop.id && other.pointId === targetPointId && !selectedIds.includes(other.id),
    )

    if (occupiedByOthers && targetPointId !== troop.pointId) {
      errorMessage.value = 'Esse ponto já está ocupado por outra tropa.'
      return
    }

    const path = findShortestPath(troop.pointId, targetPointId, points)
    if (path.length === 0) {
      errorMessage.value = 'Não existe rota válida até esse ponto.'
      return
    }

    if (!canTroopTraversePath(troop, path)) {
      errorMessage.value = 'Uma tropa não pode entrar na província de outro país.'
      return
    }

    routesByTroop.set(troop.id, path)
    occupancyCheck.add(troop.id)
  }

  if (routesByTroop.size === 0) {
    return
  }

  for (const troop of troopsToMove) {
    const route = routesByTroop.get(troop.id)
    if (!route || troop.pointId === null) {
      continue
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

function handleBoardMouseUp() {
  if (frontlineSelectionMode.value && frontlineStartPointId.value !== null) {
    finishFrontlineSelection()
    return
  }

  finishSelectionDrag()
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
    return
  }

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

function getBoardMousePosition(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function getTroopScreenPosition(troop: CombatTroop) {
  const renderPosition = getTroopRenderPosition(troop)
  const offsetX = (boardWidth.value - boardWidth.value / zoom.value) / 2 + panX.value
  const offsetY = (boardHeight.value - boardHeight.value / zoom.value) / 2 + panY.value

  const boardNode = document.querySelector('.board-wrap') as HTMLElement | null
  const svgNode = boardNode?.querySelector('svg') as SVGSVGElement | null
  const svgRect = svgNode?.getBoundingClientRect() ?? boardNode?.getBoundingClientRect() ?? null
  const widthScale = svgRect && svgRect.width > 0 ? svgRect.width / boardWidth.value : 1
  const heightScale = svgRect && svgRect.height > 0 ? svgRect.height / boardHeight.value : 1

  return {
    x: (renderPosition.x * zoom.value + offsetX) * widthScale,
    y: (renderPosition.y * zoom.value + offsetY) * heightScale,
  }
}

function setZoom(nextZoom: number, anchorX: number | null = null, anchorY: number | null = null) {
  const currentZoom = zoom.value
  const clampedNextZoom = Math.min(20, Math.max(0.25, Number(nextZoom) || 1))

  if (anchorX === null || anchorY === null) {
    zoom.value = clampedNextZoom
    return
  }

  const width = boardWidth.value
  const height = boardHeight.value
  const currentOffsetX = (width - width / currentZoom) / 2 + panX.value
  const currentOffsetY = (height - height / currentZoom) / 2 + panY.value

  const worldXAtPointer = (anchorX - currentOffsetX) / currentZoom
  const worldYAtPointer = (anchorY - currentOffsetY) / currentZoom

  const nextOffsetX = anchorX - worldXAtPointer * clampedNextZoom
  const nextOffsetY = anchorY - worldYAtPointer * clampedNextZoom

  panX.value = nextOffsetX - (width - width / clampedNextZoom) / 2
  panY.value = nextOffsetY - (height - height / clampedNextZoom) / 2
  zoom.value = clampedNextZoom
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

function startSelectionDrag(event: MouseEvent) {
  if (event.button !== 0 || isMovementMode.value || frontlineSelectionMode.value || event.ctrlKey || event.metaKey) {
    return
  }

  const target = event.target as HTMLElement | null
  if (target && target.closest('circle')) {
    return
  }

  selectionStart.value = getBoardMousePosition(event)
  selectionRect.value = {
    x: selectionStart.value.x,
    y: selectionStart.value.y,
    width: 0,
    height: 0,
  }
}

function updateSelectionDrag(event: MouseEvent) {
  if (!selectionStart.value) {
    moveMapByCursor(event)
    return
  }

  const current = getBoardMousePosition(event)
  const x = Math.min(selectionStart.value.x, current.x)
  const y = Math.min(selectionStart.value.y, current.y)
  const width = Math.abs(current.x - selectionStart.value.x)
  const height = Math.abs(current.y - selectionStart.value.y)

  selectionRect.value = { x, y, width, height }
}

function finishSelectionDrag() {
  if (!selectionStart.value) {
    return
  }

  const currentSelection = selectionRect.value
  selectionStart.value = null

  const shouldSelect = currentSelection && Math.max(currentSelection.width, currentSelection.height) > 6
  if (!shouldSelect) {
    selectionRect.value = null
    return
  }

  const controlledTroops = troops.value.filter((troop) => troopCountryToId[troop.country] === controlledCountryId.value)
  const nextSelectedIds = controlledTroops
    .filter((troop) => {
      const position = getTroopScreenPosition(troop)
      const insideX = position.x >= currentSelection.x && position.x <= currentSelection.x + currentSelection.width
      const insideY = position.y >= currentSelection.y && position.y <= currentSelection.y + currentSelection.height
      return insideX && insideY
    })
    .map((troop) => troop.id)

  selectedTroopIds.value = nextSelectedIds
  selectedTroopId.value = nextSelectedIds[0] ?? null
  selectionRect.value = null
}

function onWheelZoom(event: WheelEvent) {
  event.preventDefault()

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  const direction = event.deltaY < 0 ? 1.15 : 0.85
  const nextZoom = zoom.value * direction

  setZoom(nextZoom, mouseX, mouseY)
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
      <div
        class="board-wrap"
        :class="{ 'frontline-active': frontlineSelectionMode }"
        @wheel="onWheelZoom"
        @mousedown="startSelectionDrag"
        @mousemove="updateSelectionDrag"
        @mouseup="handleBoardMouseUp"
        @mouseleave="handleBoardMouseUp"
      >
        <div v-if="selectionRect" class="selection-box" :style="selectionBoxStyle" />

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
                stroke-width="2"
                stroke-dasharray="6 6"
                opacity="0.95"
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
                :r="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 7 : hoveredDestinationId === point.id && isMovementMode ? 8 : 5"
                :fill="getPointColor(point.country_id)"
                stroke="#0f172a"
                :stroke-width="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 3 : hoveredDestinationId === point.id && isMovementMode ? 3 : 1.5"
                :opacity="frontlineSelectionMode ? (isPointFrontlineEligible(point.id) ? 1 : 0.2) : hoveredDestinationId === point.id && isMovementMode ? 1 : 0.95"
                :filter="frontlineSelectionMode && isPointFrontlineEligible(point.id) ? 'drop-shadow(0 0 5px rgba(251, 191, 36, 0.85))' : undefined"
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
                class="province-label"
              >
                {{ point.name ?? point.id }}
              </text>

              <g v-for="troop in troops" :key="troop.id">
                <circle
                  :cx="getTroopRenderPosition(troop).x"
                  :cy="getTroopRenderPosition(troop).y"
                  r="10"
                  :fill="troop.country === 'blue' ? '#3b82f6' : '#ef4444'"
                  :stroke="selectedTroopIds.includes(troop.id) || selectedTroopId === troop.id ? '#f8fafc' : '#0f172a'"
                  stroke-width="2.5"
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
            </g>
          </g>
        </svg>
      </div>

      <aside v-if="selectedTroopIds.length" class="selection-panel">
        <div class="panel-header">
          <h3>Unidades selecionadas</h3>
          <button type="button" class="close-button" aria-label="Fechar seleção" @click="clearTroopSelection">×</button>
        </div>
        <ul>
          <li v-for="troop in selectedTroopsList" :key="troop.id">
            {{ troop.label }}
          </li>
        </ul>

        <div v-if="selectedTroopIds.length > 1" class="group-create-box">
          <label for="group-name">Nome do grupo</label>
          <input id="group-name" v-model="newGroupName" placeholder="Ex: Grupo A" maxlength="40" />
          <button type="button" class="action-button group-button" @click="createGroupFromSelection">
            Criar grupo
          </button>
        </div>
      </aside>

      <aside v-if="groupsForPlayer.length" class="groups-panel">
        <div class="panel-header">
          <h3>Grupos</h3>
        </div>
        <ul>
          <li v-for="group in groupsForPlayer" :key="group.id" class="group-item group-selectable" @click="selectGroup(group.id)">
            <strong>{{ group.name }}</strong>
            <span>{{ group.troopIds.map((troopId) => troopLookup.get(troopId)?.label ?? `#${troopId}`).join(', ') || 'Sem tropas' }}</span>
          </li>
        </ul>
      </aside>

      <TroopSelectionPanel
        v-if="selectedTroop"
        :troop="selectedTroop"
        :group-name="selectedGroup?.name ?? null"
        :selection-count="selectedTroopIds.length"
        :is-movement-mode="isMovementMode"
        @move="startMovementMode"
        @frontline="startFrontlineSelection"
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

.selection-panel h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  color: #f8fafc;
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

.groups-panel {
  position: absolute;
  left: 1.5rem;
  bottom: 1.5rem;
  z-index: 26;
  width: min(140px, 15vw);
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
  flex-direction: column;
  gap: 0.5rem;
}

.group-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.65rem 0.7rem;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.group-selectable {
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.group-selectable:hover {
  border-color: rgba(96, 165, 250, 0.7);
  transform: translateY(-1px);
}

.group-item strong {
  color: #f8fafc;
}

.group-item span {
  color: #cbd5e1;
  font-size: 0.8rem;
  line-height: 1.4;
}

.selection-box {
  position: absolute;
  z-index: 12;
  border: 1px solid rgba(148, 163, 184, 0.9);
  background: rgba(148, 163, 184, 0.22);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
