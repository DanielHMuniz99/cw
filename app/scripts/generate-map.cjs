#!/usr/bin/env node
/**
 * generate-map.js
 * Gera um mapa fictício com continentes e províncias que se encaixam (Voronoi).
 *
 * Uso:
 *   node generate-map.js [numProvincias] [opções]
 *
 * Exemplos:
 *   node generate-map.js 120
 *   node generate-map.js 200 --continents 4 --width 6000 --height 3000
 *   node generate-map.js 80 --out ./meu-mapa.json
 *
 * Saída: JSON no mesmo formato do mapa visual (sem centers).
 */

const fs = require('fs')
const path = require('path')
const { Delaunay } = require('d3-delaunay')

// ====================== CLI ======================
function parseArgs(argv) {
  const args = {
    provinces: 100,
    continents: 3,
    width: 5000,
    height: 2800,
    seed: Date.now() % 1e9,
    out: path.join(__dirname, 'mapa-gerado.json'),
    margin: 40,          // margem do mapa
    minArea: 80,         // área mínima para manter a província
  }

  const positional = []
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--continents' || a === '-c') args.continents = Number(argv[++i])
    else if (a === '--width' || a === '-w') args.width = Number(argv[++i])
    else if (a === '--height' || a === '-h') args.height = Number(argv[++i])
    else if (a === '--seed' || a === '-s') args.seed = Number(argv[++i])
    else if (a === '--out' || a === '-o') args.out = argv[++i]
    else if (a === '--margin') args.margin = Number(argv[++i])
    else if (a === '--help') {
      console.log(`
Uso: node generate-map.js [numProvincias] [opções]

Opções:
  --continents, -c   Número de continentes (default: 3)
  --width, -w        Largura do mapa (default: 5000)
  --height, -h       Altura do mapa (default: 2800)
  --seed, -s         Seed para reprodutibilidade
  --out, -o          Arquivo de saída (default: mapa-gerado.json)
  --margin           Margem interna do mapa (default: 40)
`)
      process.exit(0)
    } else if (!a.startsWith('-')) {
      positional.push(a)
    }
  }

  if (positional[0]) args.provinces = Number(positional[0])
  return args
}

// ====================== RNG simples (mulberry32) ======================
function createRng(seed) {
  let s = seed >>> 0
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ====================== LAND MASK (continentes) ======================
/**
 * Gera uma máscara de terra (Uint8Array width*height).
 * 1 = terra, 0 = oceano.
 * Usa vários "blobs" elípticos com ruído simples para formar continentes.
 */
function generateLandMask(width, height, numContinents, rng, margin) {
  const mask = new Uint8Array(width * height)

  // Posições base dos continentes (espalhados)
  const blobs = []
  for (let i = 0; i < numContinents; i++) {
    // Distribui horizontalmente com variação
    const cx = margin + (width - 2 * margin) * ((i + 0.5) / numContinents) + (rng() - 0.5) * (width / numContinents) * 0.4
    const cy = margin + (height - 2 * margin) * (0.3 + rng() * 0.4)
    const rx = (width / numContinents) * (0.35 + rng() * 0.35)
    const ry = height * (0.22 + rng() * 0.28)
    blobs.push({ cx, cy, rx, ry, rot: (rng() - 0.5) * 0.8 })
  }

  // Alguns blobs extras menores (ilhas / penínsulas)
  const extra = Math.max(1, Math.floor(numContinents * 0.6))
  for (let i = 0; i < extra; i++) {
    const cx = margin + rng() * (width - 2 * margin)
    const cy = margin + rng() * (height - 2 * margin)
    const rx = 80 + rng() * 180
    const ry = 60 + rng() * 140
    blobs.push({ cx, cy, rx, ry, rot: (rng() - 0.5) * 1.2 })
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < margin || y < margin || x >= width - margin || y >= height - margin) continue

      let land = false
      for (const b of blobs) {
        // Coordenadas relativas com rotação simples
        const dx = x - b.cx
        const dy = y - b.cy
        const cos = Math.cos(b.rot)
        const sin = Math.sin(b.rot)
        const lx = dx * cos + dy * sin
        const ly = -dx * sin + dy * cos
        // Elipse + ruído barato
        const nx = Math.sin(x * 0.012 + y * 0.007) * 0.18
        const ny = Math.cos(x * 0.009 - y * 0.011) * 0.18
        const v = (lx / b.rx) ** 2 + (ly / b.ry) ** 2 + nx + ny
        if (v < 1) {
          land = true
          break
        }
      }
      if (land) mask[y * width + x] = 1
    }
  }

  // Suavização leve (remove pixels isolados / preenche buracos pequenos)
  smoothMask(mask, width, height, 2)

  return mask
}

function smoothMask(mask, width, height, passes) {
  const copy = new Uint8Array(mask)
  for (let p = 0; p < passes; p++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += mask[(y + dy) * width + (x + dx)]
          }
        }
        // Maioria → terra
        copy[y * width + x] = sum >= 5 ? 1 : 0
      }
    }
    mask.set(copy)
  }
}

function isLand(mask, width, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= mask.length / width) return false
  return mask[Math.floor(y) * width + Math.floor(x)] === 1
}

// ====================== SEEDS (pontos) ======================
function placeSeeds(mask, width, height, count, rng, margin) {
  const landPixels = []
  // Amostra a cada 4px para não ficar pesado
  const step = 4
  for (let y = margin; y < height - margin; y += step) {
    for (let x = margin; x < width - margin; x += step) {
      if (mask[y * width + x]) landPixels.push({ x, y })
    }
  }

  if (landPixels.length === 0) {
    throw new Error('Nenhuma terra gerada. Tente mais continentes ou seed diferente.')
  }

  // Embaralha e pega N pontos com distância mínima aproximada
  for (let i = landPixels.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[landPixels[i], landPixels[j]] = [landPixels[j], landPixels[i]]
  }

  const minDist = Math.sqrt((width * height) / count) * 0.35
  const minDist2 = minDist * minDist
  const seeds = []

  for (const p of landPixels) {
    if (seeds.length >= count) break
    let ok = true
    for (const s of seeds) {
      const dx = p.x - s[0]
      const dy = p.y - s[1]
      if (dx * dx + dy * dy < minDist2) {
        ok = false
        break
      }
    }
    if (ok) seeds.push([p.x + rng() * step, p.y + rng() * step])
  }

  // Se não conseguiu o suficiente, completa com pontos aleatórios em terra
  let tries = 0
  while (seeds.length < count && tries < count * 50) {
    tries++
    const p = landPixels[Math.floor(rng() * landPixels.length)]
    seeds.push([p.x + rng() * step, p.y + rng() * step])
  }

  return seeds
}

// ====================== POLÍGONO HELPERS ======================
function polygonArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return Math.abs(a / 2)
}

function clipPolygonToBounds(pts, width, height, margin) {
  // Sutherland–Hodgman simples contra o retângulo interno
  const edges = [
    { x: margin, y: margin, nx: 1, ny: 0 },           // left
    { x: width - margin, y: margin, nx: -1, ny: 0 },  // right
    { x: margin, y: margin, nx: 0, ny: 1 },           // top
    { x: margin, y: height - margin, nx: 0, ny: -1 }, // bottom
  ]

  let output = pts
  for (const e of edges) {
    if (output.length === 0) break
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]
      const prev = input[(i + input.length - 1) % input.length]
      const curIn = (cur[0] - e.x) * e.nx + (cur[1] - e.y) * e.ny >= 0
      const prevIn = (prev[0] - e.x) * e.nx + (prev[1] - e.y) * e.ny >= 0

      if (curIn) {
        if (!prevIn) {
          output.push(intersect(prev, cur, e))
        }
        output.push(cur)
      } else if (prevIn) {
        output.push(intersect(prev, cur, e))
      }
    }
  }
  return output
}

function intersect(a, b, edge) {
  // Interseção da aresta a→b com a linha da borda
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  // linha: (p - edge.xy) · n = 0
  const denom = dx * edge.nx + dy * edge.ny
  if (Math.abs(denom) < 1e-9) return [...a]
  const t = ((edge.x - a[0]) * edge.nx + (edge.y - a[1]) * edge.ny) / denom
  return [a[0] + t * dx, a[1] + t * dy]
}

/**
 * Clip simples do polígono Voronoi contra a máscara de terra.
 * Estratégia prática: amostra o polígono e reconstrói um contorno aproximado
 * pelos pontos que estão em terra + pontos de borda terra/água.
 * Para manter o script simples e rápido, fazemos:
 *  - se a maior parte do polígono está em terra → mantém (clipado só no bounds)
 *  - senão descarta ou reduz.
 * Depois refinamos com um clip por "ray" nos vértices.
 */
function keepLandPolygon(pts, mask, width, height) {
  if (pts.length < 3) return null

  // Conta quantos vértices estão em terra
  let landVerts = 0
  const filtered = []
  for (const p of pts) {
    const onLand = isLand(mask, width, p[0], p[1])
    if (onLand) {
      landVerts++
      filtered.push(p)
    }
  }

  // Se quase nenhum vértice está em terra, descarta
  if (landVerts < 3) return null

  // Se a maioria está em terra, usa o polígono completo (já clipado no bounds)
  // Isso preserva o "quebra-cabeça" entre províncias vizinhas.
  if (landVerts / pts.length >= 0.45) {
    return pts
  }

  // Caso intermediário: tenta usar só vértices em terra (pode gerar polígono estranho)
  if (filtered.length >= 3) return filtered
  return null
}

function simplifyPolygon(pts, epsilon = 1.5) {
  // Douglas-Peucker leve para reduzir vértices
  if (pts.length <= 4) return pts

  function perpDist(p, a, b) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
    const projX = a[0] + t * dx
    const projY = a[1] + t * dy
    return Math.hypot(p[0] - projX, p[1] - projY)
  }

  function dp(points, eps) {
    let maxD = 0
    let idx = 0
    const end = points.length - 1
    for (let i = 1; i < end; i++) {
      const d = perpDist(points[i], points[0], points[end])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > eps) {
      const left = dp(points.slice(0, idx + 1), eps)
      const right = dp(points.slice(idx), eps)
      return left.slice(0, -1).concat(right)
    }
    return [points[0], points[end]]
  }

  // Fecha temporariamente
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
    ? pts.slice(0, -1)
    : pts

  const simplified = dp(closed.concat([closed[0]]), epsilon)
  return simplified.slice(0, -1)
}

// ====================== GERAÇÃO PRINCIPAL ======================
function generateMap(options) {
  const { provinces, continents, width, height, seed, margin, minArea } = options
  const rng = createRng(seed)

  console.log(`Gerando mapa ${width}x${height}`)
  console.log(`  Continentes: ${continents}`)
  console.log(`  Províncias:  ${provinces}`)
  console.log(`  Seed:        ${seed}`)

  console.log('1/4 Máscara de terra (continentes)...')
  const mask = generateLandMask(width, height, continents, rng, margin)

  let landCount = 0
  for (let i = 0; i < mask.length; i++) landCount += mask[i]
  console.log(`   Terra: ${((landCount / mask.length) * 100).toFixed(1)}% do mapa`)

  console.log('2/4 Posicionando sementes...')
  const seeds = placeSeeds(mask, width, height, provinces, rng, margin)
  console.log(`   Sementes: ${seeds.length}`)

  console.log('3/4 Calculando Voronoi (quebra-cabeça)...')
  const delaunay = Delaunay.from(seeds)
  const voronoi = delaunay.voronoi([margin, margin, width - margin, height - margin])

  console.log('4/4 Extraindo polígonos...')
  const resultProvinces = []
  let id = 1

  for (let i = 0; i < seeds.length; i++) {
    let cell = voronoi.cellPolygon(i)
    if (!cell || cell.length < 3) continue

    // cellPolygon já retorna fechado (primeiro = último) → remove o último
    if (cell.length > 1 && cell[0][0] === cell[cell.length - 1][0] && cell[0][1] === cell[cell.length - 1][1]) {
      cell = cell.slice(0, -1)
    }

    cell = clipPolygonToBounds(cell, width, height, margin)
    cell = keepLandPolygon(cell, mask, width, height)
    if (!cell || cell.length < 3) continue

    // Simplifica um pouco
    cell = simplifyPolygon(cell, 2.0)
    if (cell.length < 3) continue

    const area = polygonArea(cell)
    if (area < minArea) continue

    const vertices = cell.map(([x, y]) => ({
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    }))

    resultProvinces.push({
      id,
      name: `Província ${id}`,
      country_id: null,
      center_id: null,
      vertices,
    })
    id++
  }

  console.log(`   Províncias finais: ${resultProvinces.length}`)

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    width,
    height,
    overlayImage: null,
    centers: null,
    type: 'visual-province-map',
    meta: {
      seed,
      continents,
      requestedProvinces: provinces,
      generatedProvinces: resultProvinces.length,
    },
    provinces: resultProvinces,
  }
}

// ====================== MAIN ======================
function main() {
  const options = parseArgs(process.argv)

  if (!Number.isFinite(options.provinces) || options.provinces < 5) {
    console.error('Número de províncias inválido (mínimo 5).')
    process.exit(1)
  }

  const map = generateMap(options)

  fs.writeFileSync(options.out, JSON.stringify(map, null, 2), 'utf8')
  console.log(`\n✓ Mapa salvo em: ${options.out}`)
  console.log(`  ${map.provinces.length} províncias | ${map.width}x${map.height}`)
}

main()