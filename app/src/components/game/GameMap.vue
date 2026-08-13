<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Army, CombatIndicator, Province } from '../../types/game'
import MapControls from './MapControls.vue'
import { getCountryColor } from '../../data/countries'

const props = defineProps<{
  provinces: Province[]
  armies: Army[]
  selectedProvinceId: number | null
  selectedArmyId: number | null
  hoveredProvinceId: number | null
  previewPath: Province[]
  combatIndicators: CombatIndicator[]
  showFrontierLines?: boolean
  mapViewBox?: {
    minX: number
    minY: number
    width: number
    height: number
  }
  initialScale?: number
}>()

const emit = defineEmits<{
  (event: 'select-province', id: number): void
  (event: 'select-army', id: number): void
  (event: 'hover-province', id: number | null): void
  (event: 'clear-selection'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const staticMapCanvas = ref<HTMLCanvasElement | null>(null)
const animationFrameId = ref<number | null>(null)
const STATIC_RENDER_SCALE = 2
const isDragging = ref(false)
const dragMoved = ref(false)
const debugOverlay = ref(false)
const spatialIndex = ref<Map<string, number[]>>(new Map())
const lastFrameTime = ref(0)
const camera = ref({ x: 0, y: 0, zoom: props.initialScale ?? 1 })
const dragOrigin = ref({ x: 0, y: 0 })
const dragStart = ref({ x: 0, y: 0 })

const hoveredProvinceName = computed(() => {
  if (props.hoveredProvinceId === null) {
    return null
  }

  return props.provinces.find((province) => province.id === props.hoveredProvinceId)?.name ?? null
})

const mapBounds = computed(() => {
  if (props.mapViewBox) {
    return props.mapViewBox
  }

  if (props.provinces.length === 0) {
    return { minX: 0, minY: 0, width: 1000, height: 620 }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const province of props.provinces) {
    for (const point of parsePolygonPoints(province.points)) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parsePolygonPoints(pointsText: string) {
  return pointsText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => {
      const [xText, yText] = entry.split(',')
      const x = Number(xText)
      const y = Number(yText)
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
    })
    .filter((point): point is { x: number; y: number } => point !== null)
}

function makePolygonPath(pointsText: string) {
  const path = new Path2D()
  const points = parsePolygonPoints(pointsText)

  if (points.length === 0) {
    return path
  }

  points.forEach((point, index) => {
    if (index === 0) {
      path.moveTo(point.x, point.y)
      return
    }

    path.lineTo(point.x, point.y)
  })

  path.closePath()
  return path
}

function renderStaticMap() {
  const bounds = mapBounds.value
  const padding = 30
  const offscreen = document.createElement('canvas')
  offscreen.width = Math.max(1, Math.ceil((bounds.width + padding * 2) * STATIC_RENDER_SCALE))
  offscreen.height = Math.max(1, Math.ceil((bounds.height + padding * 2) * STATIC_RENDER_SCALE))

  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    staticMapCanvas.value = null
    return
  }

  ctx.setTransform(STATIC_RENDER_SCALE, 0, 0, STATIC_RENDER_SCALE, 0, 0)
  ctx.clearRect(0, 0, offscreen.width, offscreen.height)
  ctx.save()
  ctx.translate(padding - bounds.minX, padding - bounds.minY)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (const province of props.provinces) {
    const path = makePolygonPath(province.points)
    ctx.fillStyle = province.color
    ctx.fill(path)

    if (props.showFrontierLines ?? true) {
      ctx.strokeStyle = '#111827'
      ctx.lineWidth = 1.4
      ctx.stroke(path)
    }
  }

  ctx.restore()
  staticMapCanvas.value = offscreen
}

function buildSpatialIndex() {
  const grid = new Map<string, number[]>()
  const cellSize = 260

  for (const province of props.provinces) {
    const points = parsePolygonPoints(province.points)
    if (points.length === 0) {
      continue
    }

    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))

    const startX = Math.floor(minX / cellSize)
    const endX = Math.floor(maxX / cellSize)
    const startY = Math.floor(minY / cellSize)
    const endY = Math.floor(maxY / cellSize)

    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        const key = `${x}:${y}`
        const bucket = grid.get(key) ?? []
        bucket.push(province.id)
        grid.set(key, bucket)
      }
    }
  }

  spatialIndex.value = grid
}

function screenToWorld(screenX: number, screenY: number) {
  const canvas = canvasRef.value
  if (!canvas) {
    return { x: 0, y: 0 }
  }

  const rect = canvas.getBoundingClientRect()
  return {
    x: (screenX - rect.width / 2) / camera.value.zoom + camera.value.x,
    y: (screenY - rect.height / 2) / camera.value.zoom + camera.value.y,
  }
}

function pointInPolygon(point: { x: number; y: number }, polygonText: string) {
  const polygon = parsePolygonPoints(polygonText)
  if (polygon.length < 3) {
    return false
  }

  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index]
    const intersects =
      current.y > point.y !== polygon[previous].y > point.y &&
      point.x < ((polygon[previous].x - current.x) * (point.y - current.y)) / (polygon[previous].y - current.y + 1e-12) + current.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function hitTestProvince(screenX: number, screenY: number) {
  const worldPoint = screenToWorld(screenX, screenY)
  const cellSize = 260
  const cellX = Math.floor(worldPoint.x / cellSize)
  const cellY = Math.floor(worldPoint.y / cellSize)
  const candidateIds = new Set<number>()

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = spatialIndex.value.get(`${cellX + dx}:${cellY + dy}`) ?? []
      for (const id of bucket) {
        candidateIds.add(id)
      }
    }
  }

  for (const province of props.provinces) {
    if (candidateIds.has(province.id) && pointInPolygon(worldPoint, province.points)) {
      return province.id
    }
  }

  return null
}

function hitTestArmy(screenX: number, screenY: number) {
  const worldPoint = screenToWorld(screenX, screenY)

  for (const army of props.armies) {
    const distance = Math.hypot(worldPoint.x - army.x, worldPoint.y - army.y)
    if (distance <= 14) {
      return army.id
    }
  }

  return null
}

function drawPreviewPath(ctx: CanvasRenderingContext2D) {
  if (props.previewPath.length < 2) {
    return
  }

  ctx.beginPath()
  for (let index = 0; index < props.previewPath.length; index += 1) {
    const province = props.previewPath[index]
    if (index === 0) {
      ctx.moveTo(province.centerX, province.centerY)
    } else {
      ctx.lineTo(province.centerX, province.centerY)
    }
  }

  ctx.setLineDash([8, 7])
  ctx.strokeStyle = '#fde047'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.setLineDash([])

  for (const province of props.previewPath) {
    ctx.beginPath()
    ctx.fillStyle = '#fde047'
    ctx.arc(province.centerX, province.centerY, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCombatIndicators(ctx: CanvasRenderingContext2D) {
  for (const indicator of props.combatIndicators) {
    const width = 120
    const height = 48
    const x = indicator.x
    const y = indicator.y

    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)'
    ctx.strokeStyle = indicator.borderColor
    ctx.lineWidth = 2
    ctx.fillRect(x - width / 2, y - 76, width, height)
    ctx.strokeRect(x - width / 2, y - 76, width, height)

    ctx.beginPath()
    ctx.moveTo(x - 10, y - 28)
    ctx.lineTo(x + 10, y - 28)
    ctx.lineTo(x, y - 16)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('COMBATE', x, y - 58)
    ctx.fillStyle = '#dbeafe'
    ctx.font = '600 10px sans-serif'
    ctx.fillText(`Vitória ${indicator.winProbability}%`, x, y - 42)
  }
}

function drawArmies(ctx: CanvasRenderingContext2D) {
  for (const army of props.armies) {
    const color = getCountryColor(army.country)
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.arc(army.x, army.y, 10, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.fillStyle = '#111827'
    ctx.arc(army.x, army.y, 3, 0, Math.PI * 2)
    ctx.fill()

    if (props.selectedArmyId === army.id) {
      ctx.beginPath()
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 2.5
      ctx.arc(army.x, army.y, 14, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

function drawSelectionHighlights(ctx: CanvasRenderingContext2D) {
  if (props.selectedProvinceId !== null) {
    const selectedProvince = props.provinces.find((province) => province.id === props.selectedProvinceId)
    if (selectedProvince) {
      const path = makePolygonPath(selectedProvince.points)
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 3.5
      ctx.stroke(path)
    }
  }

  if (props.hoveredProvinceId !== null) {
    const hoveredProvince = props.provinces.find((province) => province.id === props.hoveredProvinceId)
    if (hoveredProvince) {
      const path = makePolygonPath(hoveredProvince.points)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.4
      ctx.stroke(path)
    }
  }
}

function resetCamera() {
  const bounds = mapBounds.value
  camera.value = {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
    zoom: clamp(props.initialScale ?? 1, 0.2, 14),
  }
}

function zoomBy(delta: number) {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const pointerX = rect.width / 2
  const pointerY = rect.height / 2
  const worldBefore = screenToWorld(pointerX, pointerY)
  const nextZoom = clamp(camera.value.zoom + delta, 0.2, 14)
  camera.value.zoom = nextZoom
  const worldAfter = screenToWorld(pointerX, pointerY)
  camera.value.x += worldBefore.x - worldAfter.x
  camera.value.y += worldBefore.y - worldAfter.y
}

function onWheel(event: WheelEvent) {
  event.preventDefault()

  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const worldBefore = screenToWorld(pointerX, pointerY)
  const zoomFactor = Math.exp((-event.deltaY * 0.0015))
  const nextZoom = clamp(camera.value.zoom * zoomFactor, 0.2, 14)

  camera.value.zoom = nextZoom
  const worldAfter = screenToWorld(pointerX, pointerY)
  camera.value.x += worldBefore.x - worldAfter.x
  camera.value.y += worldBefore.y - worldAfter.y
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  isDragging.value = true
  dragMoved.value = false
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragOrigin.value = { ...camera.value }
}

function onPointerMove(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  if (isDragging.value) {
    const dx = event.clientX - dragStart.value.x
    const dy = event.clientY - dragStart.value.y

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      dragMoved.value = true
    }

    camera.value.x = dragOrigin.value.x - dx / camera.value.zoom
    camera.value.y = dragOrigin.value.y - dy / camera.value.zoom
    return
  }

  const rect = canvas.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const hoveredProvinceId = hitTestProvince(pointerX, pointerY)
  emit('hover-province', hoveredProvinceId ?? null)
}

function onPointerUp() {
  isDragging.value = false
}

function onCanvasClick(event: MouseEvent) {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }

  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top

  const armyId = hitTestArmy(pointerX, pointerY)
  if (armyId !== null) {
    emit('select-army', armyId)
    return
  }

  const provinceId = hitTestProvince(pointerX, pointerY)
  if (provinceId !== null) {
    emit('select-province', provinceId)
    return
  }

  emit('clear-selection')
}

function renderFrame(timestamp: number) {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')

  if (!canvas || !ctx) {
    return
  }

  const rect = canvas.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 600
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)

  const elapsed = timestamp - lastFrameTime.value
  lastFrameTime.value = timestamp

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(camera.value.zoom, camera.value.zoom)
  ctx.translate(-camera.value.x, -camera.value.y)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (staticMapCanvas.value) {
    const bounds = mapBounds.value
    const padding = 30
    const worldWidth = staticMapCanvas.value.width / STATIC_RENDER_SCALE
    const worldHeight = staticMapCanvas.value.height / STATIC_RENDER_SCALE
    ctx.drawImage(
      staticMapCanvas.value,
      bounds.minX - padding,
      bounds.minY - padding,
      worldWidth,
      worldHeight,
    )
  } else {
    for (const province of props.provinces) {
      const path = makePolygonPath(province.points)
      ctx.fillStyle = province.color
      ctx.fill(path)
      if (props.showFrontierLines ?? true) {
        ctx.strokeStyle = '#111827'
        ctx.lineWidth = 1.4
        ctx.stroke(path)
      }
    }
  }

  drawPreviewPath(ctx)
  drawCombatIndicators(ctx)
  drawArmies(ctx)
  drawSelectionHighlights(ctx)

  ctx.restore()

  if (debugOverlay.value) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)'
    ctx.fillRect(14, 14, 240, 96)
    ctx.fillStyle = '#f8fafc'
    ctx.font = '600 12px sans-serif'
    ctx.fillText(`Províncias: ${props.provinces.length}`, 26, 36)
    ctx.fillText(`Zoom: ${camera.value.zoom.toFixed(2)}x`, 26, 54)
    ctx.fillText(`FPS: ${(1000 / Math.max(16, elapsed || 16)).toFixed(1)}`, 26, 72)
    ctx.fillText(`Objetos: ${props.provinces.length + props.armies.length}`, 26, 90)
  }

  animationFrameId.value = window.requestAnimationFrame(renderFrame)
}

watch(
  () => props.provinces,
  () => {
    renderStaticMap()
    buildSpatialIndex()
  },
  { deep: true, immediate: true },
)

watch(
  () => props.showFrontierLines,
  () => {
    renderStaticMap()
  },
  { immediate: true },
)

onMounted(() => {
  const bounds = mapBounds.value
  camera.value = {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
    zoom: clamp(props.initialScale ?? 1, 0.2, 14),
  }

  renderStaticMap()
  buildSpatialIndex()
  animationFrameId.value = window.requestAnimationFrame(renderFrame)
})

onBeforeUnmount(() => {
  if (animationFrameId.value !== null) {
    window.cancelAnimationFrame(animationFrameId.value)
  }
})
</script>

<template>
  <div class="game-map-shell">
    <canvas
      ref="canvasRef"
      class="game-map"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @click="onCanvasClick"
      @dblclick="debugOverlay = !debugOverlay"
    />

    <MapControls @zoom-in="zoomBy(0.6)" @zoom-out="zoomBy(-0.6)" @reset="resetCamera" />

    <div v-if="hoveredProvinceName" class="hover-banner">{{ hoveredProvinceName }}</div>
  </div>
</template>

<style scoped>
.game-map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 10%, rgba(56, 189, 248, 0.2), transparent 45%),
    radial-gradient(circle at 90% 85%, rgba(16, 185, 129, 0.22), transparent 40%),
    linear-gradient(180deg, #1f2937 0%, #0f172a 100%);
}

.game-map {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.game-map:active {
  cursor: grabbing;
}

.hover-banner {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 3;
  padding: 0.55rem 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 0.55rem;
  background: rgba(2, 6, 23, 0.78);
  color: #f8fafc;
  font-weight: 600;
}
</style>
