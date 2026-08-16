#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))

const inputFile = path.resolve(
  process.cwd(),
  args.in ?? args.input ?? 'public/teste/visual.from-svg.json',
)

const outputFile = path.resolve(
  process.cwd(),
  args.out ?? args.output ?? 'public/teste/map.json',
)

const precision = Math.max(0, Number(args.precision ?? 0))

const inputRaw = await fs.readFile(inputFile, 'utf8')
const visualMap = JSON.parse(inputRaw)

if (!visualMap || typeof visualMap !== 'object') {
  throw new Error('Invalid visual map JSON: expected an object.')
}

const width = Number(visualMap.width)
const height = Number(visualMap.height)
const provinces = Array.isArray(visualMap.provinces) ? visualMap.provinces : []

if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
  throw new Error('Invalid visual map: width/height must be positive numbers.')
}

if (provinces.length === 0) {
  throw new Error('Invalid visual map: provinces array is empty.')
}

const points = provinces
  .map((province, index) => buildPointFromProvince(province, index + 1, precision))
  .filter((point) => point !== null)

if (points.length === 0) {
  throw new Error('No valid province centers could be generated.')
}

const outputPayload = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  width: roundTo(width, precision),
  height: roundTo(height, precision),
  overlayImage: null,
  points,
}

await fs.mkdir(path.dirname(outputFile), { recursive: true })
await fs.writeFile(outputFile, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8')

console.log(`Visual map read: ${path.relative(process.cwd(), inputFile)}`)
console.log(`Provinces processed: ${provinces.length}`)
console.log(`Centers generated: ${points.length}`)
console.log(`Output map: ${path.relative(process.cwd(), outputFile)}`)

function parseArgs(argv) {
  const result = {}

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (!argument.startsWith('--')) {
      continue
    }

    const [key, inlineValue] = argument.slice(2).split('=', 2)

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

function buildPointFromProvince(province, fallbackId, precisionValue) {
  if (!province || typeof province !== 'object') {
    return null
  }

  const provinceId = Number(province.id)
  const id = Number.isFinite(provinceId) ? provinceId : fallbackId
  const name = typeof province.name === 'string' && province.name.trim().length > 0
    ? province.name
    : `Point ${id}`

  const vertices = extractVertices(province.vertices)

  if (vertices.length < 3) {
    return null
  }

  const centroid = getPolygonCentroid(vertices)
  const center = findInteriorPoint(vertices, centroid)

  return {
    id,
    name,
    center: true,
    x: roundTo(center.x, precisionValue),
    y: roundTo(center.y, precisionValue),
  }
}

function extractVertices(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.reduce((accumulator, vertex) => {
    if (!vertex || typeof vertex !== 'object') {
      return accumulator
    }

    const x = Number(vertex.x)
    const y = Number(vertex.y)

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return accumulator
    }

    accumulator.push({ x, y })
    return accumulator
  }, [])
}

function getPolygonCentroid(vertices) {
  const area = polygonArea(vertices)

  if (Math.abs(area) < 1e-9) {
    return getVertexAverage(vertices)
  }

  let sumX = 0
  let sumY = 0

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    const cross = current.x * next.y - next.x * current.y

    sumX += (current.x + next.x) * cross
    sumY += (current.y + next.y) * cross
  }

  const factor = 1 / (6 * area)

  return {
    x: sumX * factor,
    y: sumY * factor,
  }
}

function getVertexAverage(vertices) {
  let sumX = 0
  let sumY = 0

  for (const vertex of vertices) {
    sumX += vertex.x
    sumY += vertex.y
  }

  return {
    x: sumX / vertices.length,
    y: sumY / vertices.length,
  }
}

function polygonArea(vertices) {
  let area = 0

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]
    const next = vertices[(index + 1) % vertices.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}

function findInteriorPoint(vertices, preferredPoint) {
  if (isPointInsidePolygon(preferredPoint, vertices)) {
    return preferredPoint
  }

  const averagePoint = getVertexAverage(vertices)

  if (isPointInsidePolygon(averagePoint, vertices)) {
    return averagePoint
  }

  const bounds = getBounds(vertices)
  const samplesPerAxis = 36
  let bestPoint = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let ix = 0; ix <= samplesPerAxis; ix += 1) {
    const x = bounds.minX + ((bounds.maxX - bounds.minX) * ix) / samplesPerAxis

    for (let iy = 0; iy <= samplesPerAxis; iy += 1) {
      const y = bounds.minY + ((bounds.maxY - bounds.minY) * iy) / samplesPerAxis
      const candidate = { x, y }

      if (!isPointInsidePolygon(candidate, vertices)) {
        continue
      }

      const distance = squaredDistance(candidate, preferredPoint)

      if (distance < bestDistance) {
        bestDistance = distance
        bestPoint = candidate
      }
    }
  }

  if (bestPoint) {
    return bestPoint
  }

  return vertices[0]
}

function getBounds(vertices) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x)
    minY = Math.min(minY, vertex.y)
    maxX = Math.max(maxX, vertex.x)
    maxY = Math.max(maxY, vertex.y)
  }

  return { minX, minY, maxX, maxY }
}

function isPointInsidePolygon(point, vertices) {
  let inside = false

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i].x
    const yi = vertices[i].y
    const xj = vertices[j].x
    const yj = vertices[j].y

    const intersects = (
      (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi
    )

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function squaredDistance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
