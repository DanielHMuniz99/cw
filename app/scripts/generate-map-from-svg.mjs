#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))


const inputSvgFile = path.resolve(
  process.cwd(),
  args.in ?? args.input ?? 'public/world.svg',
)

const outputTsFile = path.resolve(
  process.cwd(),
  args.out ?? 'src/data/generatedWorldMap.ts',
)

const outputSvgFile = path.resolve(
  process.cwd(),
  args.svgOut ?? 'public/generated/world-provinces.svg',
)

const seed = Number(args.seed ?? Date.now())
const maxProvinceArea = Math.max(
  100,
  Number(args.maxProvinceArea ?? args.maxArea ?? 120000),
)
const curveSteps = Math.max(3, Number(args.curveSteps ?? 10))
const targetWidth = Math.max(100, Number(args.targetWidth ?? 11628))
const targetHeight = Math.max(100, Number(args.targetHeight ?? 5760))
const targetPadding = Math.max(0, Number(args.padding ?? 270))

const rng = createSeededRandom(seed)

const countryProvinceRules = {
  germany: { min: 20, max: 40 },
  france: { min: 18, max: 35 },
  italy: { min: 16, max: 30 },
  spain: { min: 14, max: 28 },
  poland: { min: 14, max: 28 },
  portugal: { min: 6, max: 8 },
  brazil: { min: 12, max: 26 },
  argentina: { min: 10, max: 22 },
  canada: { min: 12, max: 26 },
  australia: { min: 12, max: 26 },
  india: { min: 50, max: 70 },
  china: { min: 50, max: 70 },
  united_kingdom: { min: 20, max: 24 },
  czechoslovak_republic: { min: 6, max: 6 },
  switzerland: { min: 6, max: 6 },
  austria: { min: 5, max: 5 },
  ireland: { min: 5, max: 5 },
  netherlands: { min: 4, max: 5 },
  belgium: { min: 4, max: 5 },
}

const svgInput = await fs.readFile(inputSvgFile, 'utf8')
const paths = extractPathElements(svgInput)

if (paths.length === 0) {
  throw new Error('No <path> elements with id and d attributes were found.')
}

const countries = paths
  .map((pathElement) => parseCountryPath(pathElement, curveSteps))
  .filter((country) => country.polygons.length > 0)

if (countries.length === 0) {
  throw new Error('Could not parse country polygons from the SVG input.')
}

const sourceViewBox = parseSvgViewBox(svgInput) ?? computeCountriesViewBox(countries)
const scaledCountries = scaleCountriesToTarget(countries, sourceViewBox, {
  width: targetWidth,
  height: targetHeight,
  padding: targetPadding,
})

const viewBox = computeCountriesViewBox(scaledCountries)

const provinceBuild = buildProvincesFromCountries({
  countries: scaledCountries,
  rng,
  maxProvinceArea,
})

const tsOutput = renderTypescriptModule({
  countries: provinceBuild.countries,
  provinces: provinceBuild.provinces,
  sourceSvgFile: path.relative(process.cwd(), inputSvgFile),
  seed,
})

const svgOutput = renderProvinceSvg({
  viewBox,
  provinces: provinceBuild.provinces,
})

await fs.mkdir(path.dirname(outputTsFile), { recursive: true })
await fs.mkdir(path.dirname(outputSvgFile), { recursive: true })

await fs.writeFile(outputTsFile, tsOutput, 'utf8')
await fs.writeFile(outputSvgFile, svgOutput, 'utf8')

console.log(
  `Generated ${provinceBuild.provinces.length} provinces from ${countries.length} countries.`,
)
console.log(`TS output: ${path.relative(process.cwd(), outputTsFile)}`)
console.log(`SVG output: ${path.relative(process.cwd(), outputSvgFile)}`)
console.log(`Target size: ${targetWidth}x${targetHeight} (padding: ${targetPadding})`)
console.log(`Max province area: ${maxProvinceArea}`)
console.log(`Seed: ${seed}`)

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

function extractPathElements(svgSource) {
  const matches = svgSource.matchAll(/<path\b[^>]*>/gi)
  const elements = []

  for (const match of matches) {
    const tag = match[0]
    const attrs = parseTagAttributes(tag)

    if (!attrs.id || !attrs.d) {
      continue
    }

    elements.push({
      id: attrs.id,
      d: attrs.d,
    })
  }

  return elements
}

function parseTagAttributes(tag) {
  const attrs = {}
  const attrRegex = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g

  for (const match of tag.matchAll(attrRegex)) {
    const name = match[1]
    const value = match[3] ?? match[4] ?? ''
    attrs[name] = value
  }

  return attrs
}

function parseSvgViewBox(svgSource) {
  const openTag = svgSource.match(/<svg\b[^>]*>/i)

  if (!openTag) {
    return null
  }

  const attrs = parseTagAttributes(openTag[0])

  if (attrs.viewBox) {
    const parts = attrs.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)

    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3],
      }
    }
  }

  const width = Number(attrs.width)
  const height = Number(attrs.height)

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return {
      minX: 0,
      minY: 0,
      width,
      height,
    }
  }

  return null
}

function parseCountryPath(pathElement, curveSteps) {
  const polylines = parsePathData(pathElement.d, curveSteps)
  const polygons = []

  for (const line of polylines) {
    const clean = cleanupPolygon(line)

    if (clean.length >= 3 && Math.abs(polygonArea(clean)) > 1) {
      polygons.push(normalizePolygonWinding(clean))
    }
  }

  return {
    id: sanitizeCountryId(pathElement.id),
    name: pathElement.id,
    polygons,
  }
}

function parsePathData(d, curveSteps) {
  const tokens = tokenizePathData(d)

  if (tokens.length === 0) {
    return []
  }

  const polylines = []

  let index = 0
  let command = null

  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  let prevControlX = null
  let prevControlY = null

  let currentPolyline = []

  while (index < tokens.length) {
    const token = tokens[index]

    if (isCommandToken(token)) {
      command = token
      index += 1
    } else if (!command) {
      throw new Error('Invalid path data: expected command token.')
    }

    const cmd = command

    if (cmd === 'Z' || cmd === 'z') {
      if (currentPolyline.length > 0) {
        currentPolyline.push({ x: startX, y: startY })
        polylines.push(currentPolyline)
      }

      currentPolyline = []
      currentX = startX
      currentY = startY
      prevControlX = null
      prevControlY = null
      command = null
      continue
    }

    const relative = cmd === cmd.toLowerCase()

    if (cmd === 'M' || cmd === 'm') {
      const firstX = readNumber(tokens, index)
      const firstY = readNumber(tokens, index + 1)
      index += 2

      const moveX = relative ? currentX + firstX : firstX
      const moveY = relative ? currentY + firstY : firstY

      currentX = moveX
      currentY = moveY
      startX = moveX
      startY = moveY

      if (currentPolyline.length > 0) {
        polylines.push(currentPolyline)
      }

      currentPolyline = [{ x: currentX, y: currentY }]
      prevControlX = null
      prevControlY = null

      command = relative ? 'l' : 'L'
      continue
    }

    if (cmd === 'L' || cmd === 'l') {
      while (hasNumber(tokens, index)) {
        const x = readNumber(tokens, index)
        const y = readNumber(tokens, index + 1)
        index += 2

        currentX = relative ? currentX + x : x
        currentY = relative ? currentY + y : y

        currentPolyline.push({ x: currentX, y: currentY })
      }

      prevControlX = null
      prevControlY = null
      continue
    }

    if (cmd === 'H' || cmd === 'h') {
      while (hasNumber(tokens, index)) {
        const x = readNumber(tokens, index)
        index += 1

        currentX = relative ? currentX + x : x
        currentPolyline.push({ x: currentX, y: currentY })
      }

      prevControlX = null
      prevControlY = null
      continue
    }

    if (cmd === 'V' || cmd === 'v') {
      while (hasNumber(tokens, index)) {
        const y = readNumber(tokens, index)
        index += 1

        currentY = relative ? currentY + y : y
        currentPolyline.push({ x: currentX, y: currentY })
      }

      prevControlX = null
      prevControlY = null
      continue
    }

    if (cmd === 'C' || cmd === 'c') {
      while (hasNumber(tokens, index)) {
        const x1 = readNumber(tokens, index)
        const y1 = readNumber(tokens, index + 1)
        const x2 = readNumber(tokens, index + 2)
        const y2 = readNumber(tokens, index + 3)
        const x = readNumber(tokens, index + 4)
        const y = readNumber(tokens, index + 5)
        index += 6

        const p0 = { x: currentX, y: currentY }
        const p1 = { x: relative ? currentX + x1 : x1, y: relative ? currentY + y1 : y1 }
        const p2 = { x: relative ? currentX + x2 : x2, y: relative ? currentY + y2 : y2 }
        const p3 = { x: relative ? currentX + x : x, y: relative ? currentY + y : y }

        appendCubicSamples(currentPolyline, p0, p1, p2, p3, curveSteps)

        currentX = p3.x
        currentY = p3.y
        prevControlX = p2.x
        prevControlY = p2.y
      }

      continue
    }

    if (cmd === 'S' || cmd === 's') {
      while (hasNumber(tokens, index)) {
        const x2 = readNumber(tokens, index)
        const y2 = readNumber(tokens, index + 1)
        const x = readNumber(tokens, index + 2)
        const y = readNumber(tokens, index + 3)
        index += 4

        const p0 = { x: currentX, y: currentY }

        const reflected =
          prevControlX === null || prevControlY === null
            ? { x: currentX, y: currentY }
            : {
                x: currentX * 2 - prevControlX,
                y: currentY * 2 - prevControlY,
              }

        const p2 = { x: relative ? currentX + x2 : x2, y: relative ? currentY + y2 : y2 }
        const p3 = { x: relative ? currentX + x : x, y: relative ? currentY + y : y }

        appendCubicSamples(currentPolyline, p0, reflected, p2, p3, curveSteps)

        currentX = p3.x
        currentY = p3.y
        prevControlX = p2.x
        prevControlY = p2.y
      }

      continue
    }

    if (cmd === 'Q' || cmd === 'q') {
      while (hasNumber(tokens, index)) {
        const x1 = readNumber(tokens, index)
        const y1 = readNumber(tokens, index + 1)
        const x = readNumber(tokens, index + 2)
        const y = readNumber(tokens, index + 3)
        index += 4

        const p0 = { x: currentX, y: currentY }
        const p1 = { x: relative ? currentX + x1 : x1, y: relative ? currentY + y1 : y1 }
        const p2 = { x: relative ? currentX + x : x, y: relative ? currentY + y : y }

        appendQuadraticSamples(currentPolyline, p0, p1, p2, curveSteps)

        currentX = p2.x
        currentY = p2.y
        prevControlX = p1.x
        prevControlY = p1.y
      }

      continue
    }

    if (cmd === 'T' || cmd === 't') {
      while (hasNumber(tokens, index)) {
        const x = readNumber(tokens, index)
        const y = readNumber(tokens, index + 1)
        index += 2

        const p0 = { x: currentX, y: currentY }
        const reflected =
          prevControlX === null || prevControlY === null
            ? { x: currentX, y: currentY }
            : {
                x: currentX * 2 - prevControlX,
                y: currentY * 2 - prevControlY,
              }

        const p2 = { x: relative ? currentX + x : x, y: relative ? currentY + y : y }

        appendQuadraticSamples(currentPolyline, p0, reflected, p2, curveSteps)

        currentX = p2.x
        currentY = p2.y
        prevControlX = reflected.x
        prevControlY = reflected.y
      }

      continue
    }

    if (cmd === 'A' || cmd === 'a') {
      while (hasNumber(tokens, index)) {
        const rx = readNumber(tokens, index)
        const ry = readNumber(tokens, index + 1)
        const rotation = readNumber(tokens, index + 2)
        const largeArcFlag = readNumber(tokens, index + 3)
        const sweepFlag = readNumber(tokens, index + 4)
        const x = readNumber(tokens, index + 5)
        const y = readNumber(tokens, index + 6)
        index += 7

        const next = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        const arcPoints = approximateArcSegment({
          from: { x: currentX, y: currentY },
          to: next,
          rx,
          ry,
          rotation,
          largeArcFlag,
          sweepFlag,
          curveSteps,
        })

        for (const point of arcPoints) {
          currentPolyline.push(point)
        }

        currentX = next.x
        currentY = next.y
        prevControlX = null
        prevControlY = null
      }

      continue
    }

    throw new Error(`Unsupported SVG path command: ${cmd}`)
  }

  if (currentPolyline.length > 0) {
    polylines.push(currentPolyline)
  }

  return polylines
}

function tokenizePathData(d) {
  const tokenRegex = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g
  return d.match(tokenRegex) ?? []
}

function isCommandToken(token) {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token)
}

function hasNumber(tokens, index) {
  return index < tokens.length && !isCommandToken(tokens[index])
}

function readNumber(tokens, index) {
  if (index >= tokens.length || isCommandToken(tokens[index])) {
    throw new Error('Invalid path data: expected number token.')
  }

  const value = Number(tokens[index])

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid path data number: ${tokens[index]}`)
  }

  return value
}

function appendCubicSamples(polyline, p0, p1, p2, p3, steps) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const oneMinusT = 1 - t

    const x =
      oneMinusT * oneMinusT * oneMinusT * p0.x +
      3 * oneMinusT * oneMinusT * t * p1.x +
      3 * oneMinusT * t * t * p2.x +
      t * t * t * p3.x

    const y =
      oneMinusT * oneMinusT * oneMinusT * p0.y +
      3 * oneMinusT * oneMinusT * t * p1.y +
      3 * oneMinusT * t * t * p2.y +
      t * t * t * p3.y

    polyline.push({ x, y })
  }
}

function appendQuadraticSamples(polyline, p0, p1, p2, steps) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const oneMinusT = 1 - t

    const x =
      oneMinusT * oneMinusT * p0.x +
      2 * oneMinusT * t * p1.x +
      t * t * p2.x

    const y =
      oneMinusT * oneMinusT * p0.y +
      2 * oneMinusT * t * p1.y +
      t * t * p2.y

    polyline.push({ x, y })
  }
}

function approximateArcSegment({ from, to, rx, ry, rotation, largeArcFlag, sweepFlag, curveSteps }) {
  if (rx === 0 || ry === 0) {
    return [to]
  }

  const phi = (rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (from.x - to.x) / 2
  const dy2 = (from.y - to.y) / 2

  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  let rxAbs = Math.abs(rx)
  let ryAbs = Math.abs(ry)

  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs)

  if (lambda > 1) {
    const factor = Math.sqrt(lambda)
    rxAbs *= factor
    ryAbs *= factor
  }

  const rx2 = rxAbs * rxAbs
  const ry2 = ryAbs * ryAbs
  const x1p2 = x1p * x1p
  const y1p2 = y1p * y1p

  const sign = largeArcFlag === sweepFlag ? -1 : 1

  const numerator = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2)
  const denominator = Math.max(1e-12, rx2 * y1p2 + ry2 * x1p2)

  const coef = sign * Math.sqrt(numerator / denominator)

  const cxp = (coef * rxAbs * y1p) / ryAbs
  const cyp = (-coef * ryAbs * x1p) / rxAbs

  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2

  const vectorU = {
    x: (x1p - cxp) / rxAbs,
    y: (y1p - cyp) / ryAbs,
  }

  const vectorV = {
    x: (-x1p - cxp) / rxAbs,
    y: (-y1p - cyp) / ryAbs,
  }

  let theta1 = angleBetween({ x: 1, y: 0 }, vectorU)
  let deltaTheta = angleBetween(vectorU, vectorV)

  if (!sweepFlag && deltaTheta > 0) {
    deltaTheta -= Math.PI * 2
  }

  if (sweepFlag && deltaTheta < 0) {
    deltaTheta += Math.PI * 2
  }

  const steps = Math.max(3, Math.ceil((Math.abs(deltaTheta) / (Math.PI / 2)) * curveSteps))

  const points = []

  for (let step = 1; step <= steps; step += 1) {
    const theta = theta1 + (deltaTheta * step) / steps
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)

    const x =
      cosPhi * rxAbs * cosTheta -
      sinPhi * ryAbs * sinTheta +
      cx

    const y =
      sinPhi * rxAbs * cosTheta +
      cosPhi * ryAbs * sinTheta +
      cy

    points.push({ x, y })
  }

  return points
}

function angleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y
  const cross = a.x * b.y - a.y * b.x
  return Math.atan2(cross, dot)
}

function cleanupPolygon(points) {
  if (points.length === 0) {
    return points
  }

  const dedup = []

  for (const point of points) {
    const prev = dedup[dedup.length - 1]

    if (!prev || distanceBetween(prev, point) > 0.01) {
      dedup.push(point)
    }
  }

  if (dedup.length >= 2 && distanceBetween(dedup[0], dedup[dedup.length - 1]) < 0.01) {
    dedup.pop()
  }

  const simplified = []

  for (let index = 0; index < dedup.length; index += 1) {
    const prev = dedup[(index - 1 + dedup.length) % dedup.length]
    const current = dedup[index]
    const next = dedup[(index + 1) % dedup.length]

    const area = Math.abs(cross(prev, current, next))

    if (area > 0.01) {
      simplified.push(current)
    }
  }

  return simplified
}

function normalizePolygonWinding(points) {
  if (polygonArea(points) < 0) {
    return [...points].reverse()
  }

  return points
}

function polygonArea(points) {
  let sum = 0

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }

  return sum / 2
}

function polygonCentroid(points) {
  const area = polygonArea(points)

  if (Math.abs(area) < 1e-8) {
    const fallback = points.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 },
    )

    return {
      x: fallback.x / points.length,
      y: fallback.y / points.length,
    }
  }

  let cx = 0
  let cy = 0

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]

    const crossValue = a.x * b.y - b.x * a.y

    cx += (a.x + b.x) * crossValue
    cy += (a.y + b.y) * crossValue
  }

  return {
    x: cx / (6 * area),
    y: cy / (6 * area),
  }
}

function polygonBounds(points) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { minX, minY, maxX, maxY }
}

function pointInPolygon(point, polygon) {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]

    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-12) + a.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function computeCountriesViewBox(countries) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const country of countries) {
    for (const polygon of country.polygons) {
      for (const point of polygon) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      }
    }
  }

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function scaleCountriesToTarget(countries, sourceViewBox, targetSize) {
  const sourceWidth = Math.max(1e-6, sourceViewBox.width)
  const sourceHeight = Math.max(1e-6, sourceViewBox.height)

  const availableWidth = Math.max(1, targetSize.width - targetSize.padding * 2)
  const availableHeight = Math.max(1, targetSize.height - targetSize.padding * 2)

  const uniformScale = Math.min(
    availableWidth / sourceWidth,
    availableHeight / sourceHeight,
  )

  const fittedWidth = sourceWidth * uniformScale
  const fittedHeight = sourceHeight * uniformScale

  const offsetX = targetSize.padding + (availableWidth - fittedWidth) / 2
  const offsetY = targetSize.padding + (availableHeight - fittedHeight) / 2

  return countries.map((country) => ({
    ...country,
    polygons: country.polygons.map((polygon) =>
      polygon.map((point) => ({
        x: (point.x - sourceViewBox.minX) * uniformScale + offsetX,
        y: (point.y - sourceViewBox.minY) * uniformScale + offsetY,
      })),
    ),
  }))
}

function buildProvincesFromCountries({ countries, rng, maxProvinceArea }) {
  const provinces = []
  const outputCountries = []

  let provinceIdCounter = 1

  for (const country of countries) {
    const polygonsWithArea = country.polygons
      .map((polygon) => ({
        polygon,
        area: Math.abs(polygonArea(polygon)),
      }))
      .filter((item) => item.area > 1)

    if (polygonsWithArea.length === 0) {
      continue
    }

    const totalArea = polygonsWithArea.reduce((sum, item) => sum + item.area, 0)

    const allocations = applyCountryProvinceRules(
      country,
      allocateProvinceCountsByArea(
        polygonsWithArea,
        maxProvinceArea,
      ),
      polygonsWithArea,
    )

    const countryProvinceIds = []

    for (let regionIndex = 0; regionIndex < polygonsWithArea.length; regionIndex += 1) {
      const region = polygonsWithArea[regionIndex]
      const regionProvinceCount = allocations[regionIndex]

      if (regionProvinceCount <= 0) {
        continue
      }

      const centers = generateCentersInsidePolygon(region.polygon, regionProvinceCount, rng)

      const cells = generateVoronoiCellsInsidePolygon(centers, region.polygon)

      const localToProvinceId = new Array(cells.length).fill(null)

      for (let localIndex = 0; localIndex < cells.length; localIndex += 1) {
        const polygon = cleanupPolygon(cells[localIndex].polygon)

        if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 0.5) {
          continue
        }

        const center = polygonCentroid(polygon)

        const province = {
          id: provinceIdCounter,
          name: `${country.name} ${localIndex + 1}`,
          owner: country.id,
          countryId: country.id,
          countryName: country.name,
          color: colorFromString(country.id),
          points: polygon.map((point) => `${round(point.x)},${round(point.y)}`).join(' '),
          centerX: round(center.x),
          centerY: round(center.y),
          borders: [],
        }

        provinces.push(province)
        countryProvinceIds.push(provinceIdCounter)
        localToProvinceId[localIndex] = provinceIdCounter
        provinceIdCounter += 1
      }

      for (let localIndex = 0; localIndex < cells.length; localIndex += 1) {
        const provinceId = localToProvinceId[localIndex]

        if (!provinceId) {
          continue
        }

        const province = provinces.find((item) => item.id === provinceId)

        if (!province) {
          continue
        }

        const neighbors = cells[localIndex].neighbors
          .map((index) => localToProvinceId[index])
          .filter((id) => typeof id === 'number')

        province.borders = Array.from(new Set([...province.borders, ...neighbors])).sort((a, b) => a - b)
      }
    }

    const mergedPoints = country.polygons[0]
      .map((point) => `${round(point.x)},${round(point.y)}`)
      .join(' ')

    const weightedCenter = weightedCountryCenter(polygonsWithArea, totalArea)

    outputCountries.push({
      id: country.id,
      name: country.name,
      color: colorFromString(country.id),
      points: mergedPoints,
      centerX: round(weightedCenter.x),
      centerY: round(weightedCenter.y),
      provinceIds: countryProvinceIds,
    })
  }

  connectCrossCountryBorders(provinces)

  return {
    countries: outputCountries,
    provinces,
  }
}

function connectCrossCountryBorders(provinces) {
  const provinceById = new Map(provinces.map((province) => [province.id, province]))

  for (let index = 0; index < provinces.length; index += 1) {
    const current = provinces[index]
    const currentPolygon = parseProvincePoints(current.points)

    for (let otherIndex = index + 1; otherIndex < provinces.length; otherIndex += 1) {
      const neighbor = provinces[otherIndex]

      if (current.countryId === neighbor.countryId) {
        continue
      }

      if (!currentPolygon.length || !parseProvincePoints(neighbor.points).length) {
        continue
      }

      if (!polygonsShareBoundary(currentPolygon, parseProvincePoints(neighbor.points), 1.5)) {
        continue
      }

      if (!provinceById.has(current.id) || !provinceById.has(neighbor.id)) {
        continue
      }

      current.borders = Array.from(new Set([...current.borders, neighbor.id])).sort((a, b) => a - b)
      neighbor.borders = Array.from(new Set([...neighbor.borders, current.id])).sort((a, b) => a - b)
    }
  }
}

function parseProvincePoints(pointString) {
  if (!pointString || pointString.trim() === '') {
    return []
  }

  return pointString
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [xText, yText] = pair.split(',')
      const x = Number(xText)
      const y = Number(yText)

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null
      }

      return { x, y }
    })
    .filter(Boolean)
}

function applyCountryProvinceRules(country, allocations, regions) {
  const normalizedId = sanitizeCountryId(country.id)
  const rule = countryProvinceRules[normalizedId]

  if (!rule) {
    return allocations
  }

  const min = Number.isFinite(rule.min) ? Math.max(1, Number(rule.min)) : null
  const max = Number.isFinite(rule.max) ? Math.max(1, Number(rule.max)) : null

  let total = allocations.reduce((sum, count) => sum + count, 0)

  if (min !== null && total < min) {
    const targetIndex = getLargestRegionIndex(regions, allocations)

    while (total < min && targetIndex !== null) {
      allocations[targetIndex] += 1
      total += 1
    }
  }

  if (max !== null && total > max) {
    const orderedIndexes = getOrderedRegionIndexesByCount(allocations)

    while (total > max && orderedIndexes.length > 0) {
      const candidateIndex = orderedIndexes.shift()

      if (candidateIndex === undefined) {
        break
      }

      if (allocations[candidateIndex] <= 1) {
        continue
      }

      allocations[candidateIndex] -= 1
      total -= 1
    }
  }

  return allocations
}

function getLargestRegionIndex(regions, allocations) {
  if (allocations.length === 0) {
    return null
  }

  let bestIndex = 0
  let bestArea = -Infinity

  for (let index = 0; index < allocations.length; index += 1) {
    const regionArea = regions[index]?.area ?? 0
    if (regionArea > bestArea) {
      bestArea = regionArea
      bestIndex = index
    }
  }

  return bestIndex
}

function getOrderedRegionIndexesByCount(allocations) {
  return allocations
    .map((count, index) => ({ count, index }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((item) => item.index)
}

function allocateProvinceCountsByArea(regions, maxProvinceArea) {
  if (regions.length === 0) {
    return []
  }

  const safeMaxArea = Math.max(100, maxProvinceArea)

  return regions.map((region) => {
    const countFromArea = Math.ceil(region.area / safeMaxArea)
    return Math.max(1, countFromArea)
  })
}

function weightedCountryCenter(polygonsWithArea, totalArea) {
  if (totalArea <= 0) {
    return polygonCentroid(polygonsWithArea[0].polygon)
  }

  let x = 0
  let y = 0

  for (const item of polygonsWithArea) {
    const center = polygonCentroid(item.polygon)
    const weight = item.area / totalArea

    x += center.x * weight
    y += center.y * weight
  }

  return { x, y }
}

function generateCentersInsidePolygon(polygon, count, rng) {
  const bounds = polygonBounds(polygon)
  const centers = []

  let attempts = 0
  const maxAttempts = count * 800

  const baseDistance = Math.sqrt(Math.abs(polygonArea(polygon)) / count) * 0.35

  while (centers.length < count && attempts < maxAttempts) {
    attempts += 1

    const point = {
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      y: bounds.minY + rng() * (bounds.maxY - bounds.minY),
    }

    if (!pointInPolygon(point, polygon)) {
      continue
    }

    let tooClose = false

    for (const existing of centers) {
      if (distanceBetween(point, existing) < baseDistance) {
        tooClose = true
        break
      }
    }

    if (!tooClose) {
      centers.push(point)
    }
  }

  while (centers.length < count) {
    const fallback = {
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      y: bounds.minY + rng() * (bounds.maxY - bounds.minY),
    }

    if (pointInPolygon(fallback, polygon)) {
      centers.push(fallback)
    }
  }

  return centers
}

function generateVoronoiCellsInsidePolygon(centers, boundaryPolygon) {
  const cells = []

  for (let index = 0; index < centers.length; index += 1) {
    const center = centers[index]
    let polygon = [...boundaryPolygon]

    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (index === otherIndex) {
        continue
      }

      polygon = clipPolygonByBisector(polygon, center, centers[otherIndex])

      if (polygon.length === 0) {
        break
      }
    }

    cells.push({
      polygon,
      neighbors: [],
    })
  }

  for (let index = 0; index < cells.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < cells.length; otherIndex += 1) {
      if (polygonsShareBoundary(cells[index].polygon, cells[otherIndex].polygon)) {
        cells[index].neighbors.push(otherIndex)
        cells[otherIndex].neighbors.push(index)
      }
    }
  }

  return cells
}

function clipPolygonByBisector(polygon, site, other) {
  if (polygon.length === 0) {
    return []
  }

  const dx = other.x - site.x
  const dy = other.y - site.y

  const midpoint = {
    x: (site.x + other.x) / 2,
    y: (site.y + other.y) / 2,
  }

  const inside = (point) =>
    (point.x - midpoint.x) * dx + (point.y - midpoint.y) * dy <= 1e-6

  const intersection = (a, b) => {
    const da = (a.x - midpoint.x) * dx + (a.y - midpoint.y) * dy
    const db = (b.x - midpoint.x) * dx + (b.y - midpoint.y) * dy
    const t = da / (da - db)

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    }
  }

  const result = []

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]

    const currentInside = inside(current)
    const nextInside = inside(next)

    if (currentInside && nextInside) {
      result.push(next)
      continue
    }

    if (currentInside && !nextInside) {
      result.push(intersection(current, next))
      continue
    }

    if (!currentInside && nextInside) {
      result.push(intersection(current, next))
      result.push(next)
    }
  }

  return cleanupPolygon(result)
}

function polygonsShareBoundary(first, second) {
  if (first.length < 2 || second.length < 2) {
    return false
  }

  const threshold = 0.4

  for (let i = 0; i < first.length; i += 1) {
    const a1 = first[i]
    const a2 = first[(i + 1) % first.length]

    for (let j = 0; j < second.length; j += 1) {
      const b1 = second[j]
      const b2 = second[(j + 1) % second.length]

      if (segmentsAlmostEqual(a1, a2, b1, b2, threshold)) {
        return true
      }
    }
  }

  return false
}

function segmentsAlmostEqual(a1, a2, b1, b2, threshold) {
  const direct =
    distanceBetween(a1, b1) < threshold && distanceBetween(a2, b2) < threshold

  const inverse =
    distanceBetween(a1, b2) < threshold && distanceBetween(a2, b1) < threshold

  return direct || inverse
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function distanceBetween(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function sanitizeCountryId(value) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return normalized || 'country'
}

function colorFromString(value) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 60% 52%)`
}

function round(value) {
  return Math.round(value)
}

function createSeededRandom(initialSeed) {
  let state = initialSeed >>> 0

  return function random() {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

function renderTypescriptModule({ countries, provinces, sourceSvgFile, seed }) {
  const generatedProvinces = provinces.map((province) => ({
    id: province.id,
    name: province.name,
    owner: province.owner,
    points: province.points,
    centerX: province.centerX,
    centerY: province.centerY,
    borders: province.borders,
    color: province.color,
    countryId: province.countryId,
    countryName: province.countryName,
  }))

  const mapData = {
    provinces: generatedProvinces.map((province) => ({
      id: province.id,
      name: province.name,
      owner: province.owner,
      points: province.points,
      centerX: province.centerX,
      centerY: province.centerY,
      borders: province.borders,
      color: province.color,
    })),
  }

  return `import type { GameMapData, Province } from '../types/game'\n\nexport interface GeneratedCountry {\n  id: string\n  name: string\n  color: string\n  points: string\n  centerX: number\n  centerY: number\n  provinceIds: number[]\n}\n\nexport interface GeneratedProvince extends Province {\n  countryId: string\n  countryName: string\n}\n\nexport const countries: GeneratedCountry[] = ${JSON.stringify(countries, null, 2)}\n\nexport const generatedProvinces: GeneratedProvince[] = ${JSON.stringify(generatedProvinces, null, 2)}\n\nexport const gameMapData: GameMapData = ${JSON.stringify(mapData, null, 2)}\n\nexport const provinces: Province[] = gameMapData.provinces.map((province) => ({\n  ...province,\n  color: province.color ?? '#6b7280',\n}))\n\nexport const provinceCountryById: Record<number, { countryId: string; countryName: string }> = Object.fromEntries(\n  generatedProvinces.map((province) => [\n    province.id,\n    { countryId: province.countryId, countryName: province.countryName },\n  ]),\n)\n\nexport const generatedMeta = {\n  sourceSvgFile: ${JSON.stringify(sourceSvgFile)},\n  seed: ${seed},\n  generatedAt: ${JSON.stringify(new Date().toISOString())},\n}\n`
}

function renderProvinceSvg({ viewBox, provinces }) {
  const { minX, minY, width, height } = viewBox

  const polygons = provinces
    .map(
      (province) =>
        `<polygon id="province-${province.id}" data-country="${escapeXml(province.countryId)}" points="${province.points}" fill="${province.color}" stroke="#111" stroke-width="0.5" />`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#e8eef2" />\n  <g id="world-provinces">\n${indentLines(polygons, 4)}\n  </g>\n</svg>\n`
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function indentLines(value, spaces) {
  const prefix = ' '.repeat(spaces)
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}
