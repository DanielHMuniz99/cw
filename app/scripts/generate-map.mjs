#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))

const seed = Number(args.seed ?? Date.now())
const count = Number(args.count ?? 45)

const width = Number(args.width ?? 1100)
const height = Number(args.height ?? 620)
const margin = Number(args.margin ?? 36)

const outputFile = path.resolve(
  process.cwd(),
  args.out ?? 'src/data/generatedMap.ts',
)

const rng = createSeededRandom(seed)

const ownerPalette = [
  'player',
  'ally',
  'enemy',
  'neutral',
]

const provinceNames = [
  'Northwatch',
  'High Ridge',
  'Iron Basin',
  'Silver Coast',
  'Sun Gate',
  'East March',
  'Oak Frontier',
  'River Crown',
  'Amber Plains',
  'Gray Valley',
  'Deep Hollow',
  'Fort Banner',
  'Storm Delta',
  'Red Expanse',
  'South Bay',
  'West Crest',
  'Moon Harbor',
  'Gold Ridge',
  'Cinder Fields',
  'Azure Pass',
]

// ---------------------------------------------------------
// MAP BOUNDS
// ---------------------------------------------------------

const bounds = {
  minX: margin,
  minY: margin,
  maxX: width - margin,
  maxY: height - margin,
}

// ---------------------------------------------------------
// GENERATE RANDOM PROVINCE CENTERS
// ---------------------------------------------------------

const centers = generateCenters(
  count,
  bounds,
  rng,
)

// ---------------------------------------------------------
// GENERATE VORONOI CELLS
// ---------------------------------------------------------

const cells = generateVoronoiCells(
  centers,
  bounds,
)

// ---------------------------------------------------------
// GENERATE PROVINCES
// ---------------------------------------------------------

const provinces = cells.map((cell, index) => {
  const center = centers[index]

  const polygon = simplifyPolygon(cell.polygon)

  const province = {
    id: index + 1,
    name: provinceNames[index] ?? `Province ${index + 1}`,
    owner: pickOwner(rng, ownerPalette),

    points: polygon
      .map((point) => `${round(point.x)},${round(point.y)}`)
      .join(' '),

    centerX: round(center.x),
    centerY: round(center.y),

    borders: cell.neighbors
      .map((neighbor) => neighbor + 1)
      .sort((a, b) => a - b),
  }

  return province
})

// ---------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------

const fileContents = `import type { GameMapData, Province } from '../types/game'

const ownerColorMap: Record<string, string> = {
  player: '#3b82f6',
  ally: '#22c55e',
  enemy: '#ef4444',
  neutral: '#6b7280',
}

export const gameMapData: GameMapData = {
  provinces: ${JSON.stringify(provinces, null, 2)}
}

export const provinces: Province[] = gameMapData.provinces.map((province) => ({
  ...province,
  color: province.color ?? ownerColorMap[province.owner] ?? ownerColorMap.neutral,
}))
`

await fs.mkdir(path.dirname(outputFile), { recursive: true })

await fs.writeFile(
  outputFile,
  fileContents,
  'utf8',
)

console.log(
  `Generated ${path.relative(process.cwd(), outputFile)} using seed ${seed}`,
)


// =========================================================
// ARGUMENTS
// =========================================================

function parseArgs(argv) {
  const result = {}

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (!argument.startsWith('--')) {
      continue
    }

    const [key, inlineValue] = argument
      .slice(2)
      .split('=', 2)

    if (inlineValue !== undefined) {
      result[key] = inlineValue
      continue
    }

    const nextValue = argv[index + 1]

    if (nextValue && !nextValue.startsWith('--')) {
      result[key] = nextValue
      index += 1
      continue
    }

    result[key] = 'true'
  }

  return result
}


// =========================================================
// SEEDED RANDOM
// =========================================================

function createSeededRandom(initialSeed) {
  let state = initialSeed >>> 0

  return function random() {
    state = (
      1664525 * state +
      1013904223
    ) >>> 0

    return state / 4294967296
  }
}


// =========================================================
// GENERATE CENTERS
// =========================================================

function generateCenters(count, bounds, random) {
  const centers = []

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  /*
   * A distância mínima não é fixa.
   *
   * Isso permite:
   *
   *   centro próximo
   *          • •
   *
   *   centro distante
   *
   *   •
   *
   *
   *              •
   */

  const baseDistance =
    Math.sqrt(
      (width * height) / count,
    ) * 0.42

  let attempts = 0

  while (
    centers.length < count &&
    attempts < count * 100
  ) {
    attempts += 1

    const point = {
      x:
        bounds.minX +
        random() * width,

      y:
        bounds.minY +
        random() * height,
    }

    /*
     * Permite centros muito próximos,
     * mas evita que vários caiam praticamente
     * no mesmo lugar.
     */

    let valid = true

    for (const existing of centers) {
      const distance = distanceBetween(
        point,
        existing,
      )

      if (
        distance <
        baseDistance * 0.30
      ) {
        valid = false
        break
      }
    }

    if (valid) {
      centers.push(point)
    }
  }

  /*
   * Em casos extremos, completa os centros
   * sem restrição de distância.
   */

  while (centers.length < count) {
    centers.push({
      x:
        bounds.minX +
        random() * width,

      y:
        bounds.minY +
        random() * height,
    })
  }

  /*
   * Pequena relaxada nos centros.
   *
   * IMPORTANTE:
   *
   * Não fazemos um Lloyd completo.
   *
   * O objetivo é manter irregularidade.
   */

  for (let iteration = 0; iteration < 2; iteration += 1) {
    relaxCenters(
      centers,
      bounds,
      random,
    )
  }

  return centers
}


// =========================================================
// RELAX CENTERS
// =========================================================

function relaxCenters(centers, bounds, random) {
  for (let index = 0; index < centers.length; index += 1) {
    const center = centers[index]

    let pushX = 0
    let pushY = 0
    let interactions = 0

    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (index === otherIndex) {
        continue
      }

      const other = centers[otherIndex]

      const dx = center.x - other.x
      const dy = center.y - other.y

      const distance = Math.sqrt(
        dx * dx +
        dy * dy,
      )

      if (distance === 0) {
        continue
      }

      const desiredDistance = 55

      if (distance < desiredDistance) {
        const force =
          (desiredDistance - distance) /
          desiredDistance

        pushX += (dx / distance) * force
        pushY += (dy / distance) * force

        interactions += 1
      }
    }

    if (interactions > 0) {
      center.x +=
        (pushX / interactions) * 7

      center.y +=
        (pushY / interactions) * 7
    }

    /*
     * Pequeno ruído para não deixar o
     * resultado excessivamente uniforme.
     */

    center.x += (random() - 0.5) * 8
    center.y += (random() - 0.5) * 8

    center.x = clamp(
      center.x,
      bounds.minX,
      bounds.maxX,
    )

    center.y = clamp(
      center.y,
      bounds.minY,
      bounds.maxY,
    )
  }
}


// =========================================================
// VORONOI
// =========================================================

function generateVoronoiCells(centers, bounds) {
  const cells = []

  for (let index = 0; index < centers.length; index += 1) {
    const center = centers[index]

    let polygon = [
      {
        x: bounds.minX,
        y: bounds.minY,
      },
      {
        x: bounds.maxX,
        y: bounds.minY,
      },
      {
        x: bounds.maxX,
        y: bounds.maxY,
      },
      {
        x: bounds.minX,
        y: bounds.maxY,
      },
    ]

    const neighbors = new Set()

    for (
      let otherIndex = 0;
      otherIndex < centers.length;
      otherIndex += 1
    ) {
      if (index === otherIndex) {
        continue
      }

      const other = centers[otherIndex]

      const beforeLength = polygon.length

      polygon = clipPolygon(
        polygon,
        center,
        other,
      )

      /*
       * Se o clipping alterou a célula,
       * existe potencialmente uma fronteira
       * entre as duas províncias.
       */

      if (
        polygon.length > 0 &&
        polygon.length !== beforeLength
      ) {
        neighbors.add(otherIndex)
      }

      if (polygon.length === 0) {
        break
      }
    }

    /*
     * A detecção acima pode incluir alguns falsos
     * positivos dependendo da geometria.
     *
     * Fazemos uma segunda validação geométrica.
     */

    const realNeighbors = new Set()

    for (const otherIndex of neighbors) {
      if (
        polygonsShareBoundary(
          polygon,
          centers[index],
          centers[otherIndex],
        )
      ) {
        realNeighbors.add(otherIndex)
      }
    }

    cells.push({
      polygon,
      neighbors: Array.from(realNeighbors),
    })
  }

  /*
   * Garante que a relação seja bidirecional.
   *
   * Se A conhece B,
   * B também conhece A.
   */

  for (let index = 0; index < cells.length; index += 1) {
    for (const neighbor of cells[index].neighbors) {
      if (!cells[neighbor].neighbors.includes(index)) {
        cells[neighbor].neighbors.push(index)
      }
    }
  }

  return cells
}


// =========================================================
// CLIP POLYGON BY VORONOI BISector
// =========================================================

function clipPolygon(
  polygon,
  site,
  other,
) {
  if (polygon.length === 0) {
    return []
  }

  /*
   * A fronteira entre dois centros é a
   * perpendicular bisector.
   *
   * Mantemos somente os pontos mais próximos
   * do "site" atual.
   */

  const dx = other.x - site.x
  const dy = other.y - site.y

  const midpoint = {
    x: (site.x + other.x) / 2,
    y: (site.y + other.y) / 2,
  }

  function inside(point) {
    return (
      (point.x - midpoint.x) * dx +
      (point.y - midpoint.y) * dy
      <= 0.000001
    )
  }

  function intersection(a, b) {
    const da =
      (a.x - midpoint.x) * dx +
      (a.y - midpoint.y) * dy

    const db =
      (b.x - midpoint.x) * dx +
      (b.y - midpoint.y) * dy

    const denominator = da - db

    if (Math.abs(denominator) < 0.000001) {
      return {
        x: a.x,
        y: a.y,
      }
    }

    const t = da / denominator

    return {
      x:
        a.x +
        (b.x - a.x) * t,

      y:
        a.y +
        (b.y - a.y) * t,
    }
  }

  const result = []

  for (let index = 0; index < polygon.length; index += 1) {
    const current =
      polygon[index]

    const next =
      polygon[
        (index + 1) %
        polygon.length
      ]

    const currentInside =
      inside(current)

    const nextInside =
      inside(next)

    if (
      currentInside &&
      nextInside
    ) {
      result.push(next)
      continue
    }

    if (
      currentInside &&
      !nextInside
    ) {
      result.push(
        intersection(
          current,
          next,
        ),
      )

      continue
    }

    if (
      !currentInside &&
      nextInside
    ) {
      result.push(
        intersection(
          current,
          next,
        ),
      )

      result.push(next)
    }
  }

  return result
}


// =========================================================
// NEIGHBOR DETECTION
// =========================================================

function polygonsShareBoundary(
  polygon,
  site,
  other,
) {
  if (polygon.length < 2) {
    return false
  }

  const midpoint = {
    x: (site.x + other.x) / 2,
    y: (site.y + other.y) / 2,
  }

  const dx = other.x - site.x
  const dy = other.y - site.y

  let boundaryLength = 0

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b =
      polygon[
        (index + 1) %
        polygon.length
      ]

    const da =
      Math.abs(
        (a.x - midpoint.x) * dx +
        (a.y - midpoint.y) * dy,
      )

    const db =
      Math.abs(
        (b.x - midpoint.x) * dx +
        (b.y - midpoint.y) * dy,
      )

    if (
      da < 0.1 &&
      db < 0.1
    ) {
      boundaryLength += distanceBetween(
        a,
        b,
      )
    }
  }

  return boundaryLength > 2
}


// =========================================================
// POLYGON CLEANUP
// =========================================================

function simplifyPolygon(polygon) {
  if (polygon.length <= 3) {
    return polygon
  }

  const result = []

  for (let index = 0; index < polygon.length; index += 1) {
    const previous =
      polygon[
        (index - 1 + polygon.length) %
        polygon.length
      ]

    const current =
      polygon[index]

    const next =
      polygon[
        (index + 1) %
        polygon.length
      ]

    const area =
      Math.abs(
        cross(
          previous,
          current,
          next,
        ),
      )

    /*
     * Remove pontos praticamente colineares.
     */

    if (area > 0.5) {
      result.push(current)
    }
  }

  return result
}


// =========================================================
// GEOMETRY
// =========================================================

function distanceBetween(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y

  return Math.sqrt(
    dx * dx +
    dy * dy,
  )
}

function cross(a, b, c) {
  return (
    (b.x - a.x) *
    (c.y - a.y) -
    (b.y - a.y) *
    (c.x - a.x)
  )
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value),
  )
}


// =========================================================
// OWNER
// =========================================================

function pickOwner(random, owners) {
  const roll = random()

  if (roll < 0.23) {
    return 'player'
  }

  if (roll < 0.46) {
    return 'ally'
  }

  if (roll < 0.72) {
    return 'enemy'
  }

  return owners[
    owners.length - 1
  ] ?? 'neutral'
}


// =========================================================
// ROUND
// =========================================================

function round(value) {
  return Math.round(value)
}