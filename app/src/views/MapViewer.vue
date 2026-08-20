<script setup lang="ts">
/**
 * MapViewer.vue — versão simples e direta
 * - Carrega mapa (provincias) + centers
 * - Normaliza os dados
 * - Renderiza com PixiJS v8
 * - Desenha conexões (borders) entre centers
 * - Pan (arrastar) + Zoom (roda do mouse)
 * - Culling básico (só desenha o que está na tela)
 */

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Application, Container, Graphics, Rectangle } from 'pixi.js'

// ====================== TIPOS ======================
interface Point {
  x: number
  y: number
}

interface VisualProvince {
  id: number
  name: string
  country_id: number | null
  center_id: number | null
  vertices: Point[]
  // bounds calculados (para culling)
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface VisualMapData {
  width: number
  height: number
  provinces: VisualProvince[]
  centersFile?: string | null
}

interface CenterPoint {
  id: number
  center: boolean          // true = centro de província | false = ponto transitório
  name: string
  x: number
  y: number
  owner: number | null
  borders: number[]        // ids dos centers conectados
}

interface CentersData {
  width: number
  height: number
  points: CenterPoint[]
}

// ====================== NORMALIZE ======================
function normalizeVisualMap(data: unknown): VisualMapData | null {
  if (!data || typeof data !== 'object') return null

  const candidate = data as Record<string, unknown>
  const width = Number(candidate.width)
  const height = Number(candidate.height)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  const rawProvinces = Array.isArray(candidate.provinces) ? candidate.provinces : []
  const provinces: VisualProvince[] = []

  for (let i = 0; i < rawProvinces.length; i++) {
    const province = rawProvinces[i]
    if (!province || typeof province !== 'object') continue

    const entry = province as Record<string, unknown>
    const id = Number(entry.id ?? i + 1)
    if (!Number.isFinite(id)) continue

    const name = typeof entry.name === 'string' ? entry.name : `Província ${id}`

    let country_id: number | null = null
    if (entry.country_id !== null && entry.country_id !== undefined && entry.country_id !== '') {
      const parsed = Number(entry.country_id)
      if (Number.isFinite(parsed)) country_id = parsed
    }

    let center_id: number | null = null
    if (entry.center_id !== null && entry.center_id !== undefined) {
      const parsed = Number(entry.center_id)
      if (Number.isFinite(parsed)) center_id = parsed
    }

    const vertices: Point[] = []
    if (Array.isArray(entry.vertices)) {
      for (const vertex of entry.vertices) {
        if (!vertex || typeof vertex !== 'object') continue
        const point = vertex as Record<string, unknown>
        const x = Number(point.x)
        const y = Number(point.y)
        if (Number.isFinite(x) && Number.isFinite(y)) {
          vertices.push({ x, y })
        }
      }
    }

    if (vertices.length < 3) continue

    // bounds para culling
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const v of vertices) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
    }

    provinces.push({ id, name, country_id, center_id, vertices, minX, minY, maxX, maxY })
  }

  const centersFile =
    typeof candidate.centers === 'string' ? candidate.centers : null

  return { width, height, provinces, centersFile }
}

// ====================== NORMALIZE CENTERS ======================
function normalizeCenters(data: unknown): CentersData | null {
  if (!data || typeof data !== 'object') return null

  const candidate = data as Record<string, unknown>
  const width = Number(candidate.width) || 0
  const height = Number(candidate.height) || 0

  const rawPoints = Array.isArray(candidate.points) ? candidate.points : []
  const points: CenterPoint[] = []

  for (let i = 0; i < rawPoints.length; i++) {
    const raw = rawPoints[i]
    if (!raw || typeof raw !== 'object') continue

    const entry = raw as Record<string, unknown>
    const id = Number(entry.id ?? i + 1)
    if (!Number.isFinite(id)) continue

    const x = Number(entry.x)
    const y = Number(entry.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue

    const name = typeof entry.name === 'string' ? entry.name : `Ponto ${id}`
    const isCenter = entry.center === true

    let owner: number | null = null
    if (entry.owner !== null && entry.owner !== undefined && entry.owner !== '') {
      const parsed = Number(entry.owner)
      if (Number.isFinite(parsed)) owner = parsed
    }

    const borders: number[] = []
    if (Array.isArray(entry.borders)) {
      for (const b of entry.borders) {
        const bid = Number(b)
        if (Number.isFinite(bid)) borders.push(bid)
      }
    }

    points.push({ id, center: isCenter, name, x, y, owner, borders })
  }

  return { width, height, points }
}

// ====================== CORES SIMPLES ======================
const COLORS = [
  0x4a90d9, 0xd94a4a, 0x4ad97a, 0xd9c24a, 0x9b4ad9,
  0xd94a9b, 0x4ad9d9, 0xd97a4a, 0x7ad94a, 0x4a4ad9,
]

function getColor(countryId: number | null): number {
  if (countryId === null) return 0x555555
  return COLORS[Math.abs(countryId) % COLORS.length]
}

// ====================== COMPONENTE ======================
const containerRef = ref<HTMLDivElement | null>(null)
const status = ref('Carregando mapa...')
const provinceCount = ref(0)
const centerCount = ref(0)

let app: Application | null = null
let world: Container | null = null
let provinceGraphics: { g: Graphics; data: VisualProvince }[] = []

// Câmera
let scale = 0.15
let offsetX = 0
let offsetY = 0
let isDragging = false
let lastMouseX = 0
let lastMouseY = 0

onMounted(async () => {
  if (!containerRef.value) return

  // 1. Buscar mapa + centers
  try {
    const mapRes = await fetch('/teste/new-visual-map.json')
    if (!mapRes.ok) throw new Error(`Mapa HTTP ${mapRes.status}`)
    const rawMap = await mapRes.json()
    const mapData = normalizeVisualMap(rawMap)

    if (!mapData) {
      status.value = 'Erro: dados do mapa inválidos'
      return
    }

    // centers: usa o nome indicado no mapa, ou fallback
    const centersPath = mapData.centersFile
      ? `/teste/${mapData.centersFile}`
      : '/teste/new-map-center.json'

    let centersData: CentersData | null = null
    try {
      const centersRes = await fetch(centersPath)
      if (centersRes.ok) {
        centersData = normalizeCenters(await centersRes.json())
      } else {
        console.warn('Centers não encontrado em', centersPath)
      }
    } catch (e) {
      console.warn('Falha ao carregar centers:', e)
    }

    provinceCount.value = mapData.provinces.length
    centerCount.value = centersData?.points.length ?? 0
    status.value = centersData
      ? `Mapa + centers carregados`
      : `Mapa carregado (sem centers)`

    // 2. Criar PixiJS
    app = new Application()
    await app.init({
      background: '#1a1a2e',
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: containerRef.value,
    })

    containerRef.value.appendChild(app.canvas)

    // 3. Container do mundo (mapa inteiro)
    world = new Container()
    app.stage.addChild(world)

    // 4. Criar os polígonos das províncias
    for (const province of mapData.provinces) {
      const g = new Graphics()
      g.cullable = true

      if (province.vertices.length > 0) {
        g.moveTo(province.vertices[0].x, province.vertices[0].y)
        for (let i = 1; i < province.vertices.length; i++) {
          g.lineTo(province.vertices[i].x, province.vertices[i].y)
        }
        g.closePath()
        g.fill({ color: getColor(province.country_id), alpha: 0.8 })
        g.stroke({ width: 0.5, color: 0x1a1a1a, alpha: 0.5 })
      }

      g.cullArea = new Rectangle(
        province.minX,
        province.minY,
        province.maxX - province.minX,
        province.maxY - province.minY
      )

      world.addChild(g)
      provinceGraphics.push({ g, data: province })
    }

    // 5. Centers + borders (conexões)
    if (centersData && centersData.points.length > 0) {
      const pointById = new Map<number, CenterPoint>()
      for (const p of centersData.points) {
        pointById.set(p.id, p)
      }

      // 5a. Linhas de conexão (borders) — desenha cada aresta só uma vez
      const edgesDrawn = new Set<string>()
      const linesG = new Graphics()
      linesG.cullable = true

      for (const p of centersData.points) {
        for (const targetId of p.borders) {
          const key = p.id < targetId ? `${p.id}-${targetId}` : `${targetId}-${p.id}`
          if (edgesDrawn.has(key)) continue
          edgesDrawn.add(key)

          const target = pointById.get(targetId)
          if (!target) continue

          linesG.moveTo(p.x, p.y)
          linesG.lineTo(target.x, target.y)
        }
      }

      // cor das fronteiras
      linesG.stroke({ width: 0.1, color: 0xf0c040, alpha: 0.1 })
      world.addChild(linesG)

      // 5b. Pontos (centers)
      const pointsG = new Graphics()
      pointsG.cullable = true

      for (const p of centersData.points) {
        if (p.center) {
          // Centro real de província — círculo maior
          pointsG.circle(p.x, p.y, 0.1)
          pointsG.fill({ color: p.owner !== null ? getColor(p.owner) : 0xffffff, alpha: 0.95 })
          pointsG.stroke({ width: 1, color: 0x111111, alpha: 0.1 })
        } else {
          // Ponto transitório — menor e mais discreto
          pointsG.circle(p.x, p.y, 0)
          pointsG.fill({ color: 0xaaaaaa, alpha: 0.1 })
        }
      }

      world.addChild(pointsG)
    }

    // 6. Centralizar câmera no mapa
    const viewW = app.screen.width
    const viewH = app.screen.height
    scale = Math.min(viewW / mapData.width, viewH / mapData.height) * 0.95
    offsetX = (viewW - mapData.width * scale) / 2
    offsetY = (viewH - mapData.height * scale) / 2
    applyCamera()

    // 6. Eventos de mouse
    const canvas = app.canvas

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      canvas.style.cursor = 'grabbing'
    })

    window.addEventListener('pointerup', () => {
      isDragging = false
      if (canvas) canvas.style.cursor = 'grab'
    })

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return
      const dx = e.clientX - lastMouseX
      const dy = e.clientY - lastMouseY
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      offsetX += dx
      offsetY += dy
      applyCamera()
    })

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Zoom em direção ao mouse
      const worldX = (mouseX - offsetX) / scale
      const worldY = (mouseY - offsetY) / scale

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      scale = Math.max(0.02, Math.min(5, scale * zoomFactor))

      offsetX = mouseX - worldX * scale
      offsetY = mouseY - worldY * scale
      applyCamera()
    }, { passive: false })

    canvas.style.cursor = 'grab'

  } catch (err) {
    console.error(err)
    status.value = `Erro ao carregar: ${(err as Error).message}`
  }
})

function applyCamera() {
  if (!world) return
  world.scale.set(scale)
  world.position.set(offsetX, offsetY)

  // Atualiza espessura das bordas conforme o zoom (opcional)
  // (deixamos simples por enquanto)
}

onBeforeUnmount(() => {
  if (app) {
    app.destroy(true)
    app = null
  }
})
</script>

<template>
  <div class="map-page">
    <header class="bar">
      <span class="title">Mapa Visual</span>
      <span class="status">{{ status }}</span>
      <span v-if="provinceCount" class="count">{{ provinceCount }} províncias</span>
      <span v-if="centerCount" class="count">{{ centerCount }} centers</span>
    </header>

    <div ref="containerRef" class="canvas-wrap"></div>

    <footer class="hint">
      Arraste para mover · Roda do mouse para zoom
    </footer>
  </div>
</template>

<style scoped>
.map-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f0f1a;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  font-size: 14px;
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  color: #e94560;
}

.status {
  opacity: 0.85;
}

.count {
  margin-left: auto;
  background: #0f3460;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 13px;
}

.canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-wrap :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.hint {
  padding: 6px 16px;
  font-size: 12px;
  opacity: 0.6;
  background: #16213e;
  border-top: 1px solid #0f3460;
  flex-shrink: 0;
}
</style>