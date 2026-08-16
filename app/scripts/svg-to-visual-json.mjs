#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))

const inputSvgFile = path.resolve(
  process.cwd(),
  args.in ?? args.input ?? 'public/generated/mc.svg',
)

const outputJsonFile = path.resolve(
  process.cwd(),
  args.out ?? args.output ?? 'public/teste/visual.from-svg.json',
)

const curveSteps = Math.max(3, Number(args.curveSteps ?? 10))
const precision = Math.max(0, Number(args.precision ?? 2))

const svgInput = await fs.readFile(inputSvgFile, 'utf8')
const pathElements = extractPathElements(svgInput)

if (pathElements.length === 0) {
  throw new Error('No <path> elements with both id and d attributes were found.')
}

const parsedProvinces = pathElements
  .map((element, index) => parseProvincePath(element, index + 1, curveSteps))
  .filter((province) => province.vertices.length >= 3)

if (parsedProvinces.length === 0) {
  throw new Error('No valid province polygons could be parsed from the SVG paths.')
}

const svgBox = parseSvgViewBoxOrSize(svgInput)
const normalized = normalizeProvincesToViewport(parsedProvinces, svgBox)
const targetWidth = parsePositiveNumber(args.width ?? args.canvasWidth, normalized.width)
const targetHeight = parsePositiveNumber(args.height ?? args.canvasHeight, normalized.height)
const scaledProvinces = scaleProvincesToSize(
  normalized.provinces,
  normalized.width,
  normalized.height,
  targetWidth,
  targetHeight,
)

const payload = {
  width: roundTo(targetWidth, precision),
  height: roundTo(targetHeight, precision),
  provinces: scaledProvinces.map((province, index) => ({
    id: province.id ?? index + 1,
    name: province.name,
    country_id: null,
    center_id: null,
    vertices: province.vertices.map((vertex) => ({
      x: roundTo(vertex.x, precision),
      y: roundTo(vertex.y, precision),
    })),
  })),
}

await fs.mkdir(path.dirname(outputJsonFile), { recursive: true })
await fs.writeFile(outputJsonFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

console.log(`SVG read: ${path.relative(process.cwd(), inputSvgFile)}`)
console.log(`Provinces parsed: ${payload.provinces.length}`)
console.log(`Output JSON: ${path.relative(process.cwd(), outputJsonFile)}`)
console.log(`Canvas size: ${payload.width} x ${payload.height}`)

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

function parseSvgViewBoxOrSize(svgSource) {
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

  const width = Number.parseFloat(String(attrs.width ?? ''))
  const height = Number.parseFloat(String(attrs.height ?? ''))

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

function parseProvincePath(pathElement, fallbackId, curveSteps) {
  const polylines = parsePathData(pathElement.d, curveSteps)

  const bestPolygon = polylines
    .map((line) => cleanupPolygon(line))
    .filter((polygon) => polygon.length >= 3)
    .sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)))[0]

  return {
    id: fallbackId,
    name: pathElement.id,
    vertices: bestPolygon ? normalizePolygonWinding(bestPolygon) : [],
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
        const p1 = {
          x: relative ? currentX + x1 : x1,
          y: relative ? currentY + y1 : y1,
        }
        const p2 = {
          x: relative ? currentX + x2 : x2,
          y: relative ? currentY + y2 : y2,
        }
        const p3 = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        appendCubicCurve(currentPolyline, p0, p1, p2, p3, curveSteps)

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
        const reflectedControl = prevControlX === null || prevControlY === null
          ? { x: currentX, y: currentY }
          : {
              x: 2 * currentX - prevControlX,
              y: 2 * currentY - prevControlY,
            }

        const p2 = {
          x: relative ? currentX + x2 : x2,
          y: relative ? currentY + y2 : y2,
        }
        const p3 = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        appendCubicCurve(currentPolyline, p0, reflectedControl, p2, p3, curveSteps)

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
        const p1 = {
          x: relative ? currentX + x1 : x1,
          y: relative ? currentY + y1 : y1,
        }
        const p2 = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        appendQuadraticCurve(currentPolyline, p0, p1, p2, curveSteps)

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
        const reflectedControl = prevControlX === null || prevControlY === null
          ? { x: currentX, y: currentY }
          : {
              x: 2 * currentX - prevControlX,
              y: 2 * currentY - prevControlY,
            }
        const p2 = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        appendQuadraticCurve(currentPolyline, p0, reflectedControl, p2, curveSteps)

        currentX = p2.x
        currentY = p2.y
        prevControlX = reflectedControl.x
        prevControlY = reflectedControl.y
      }

      continue
    }

    if (cmd === 'A' || cmd === 'a') {
      while (hasNumber(tokens, index)) {
        const rx = readNumber(tokens, index)
        const ry = readNumber(tokens, index + 1)
        const xAxisRotation = readNumber(tokens, index + 2)
        const largeArcFlag = readNumber(tokens, index + 3)
        const sweepFlag = readNumber(tokens, index + 4)
        const x = readNumber(tokens, index + 5)
        const y = readNumber(tokens, index + 6)
        index += 7

        const endPoint = {
          x: relative ? currentX + x : x,
          y: relative ? currentY + y : y,
        }

        appendArcFallback(currentPolyline, { x: currentX, y: currentY }, endPoint, {
          rx,
          ry,
          xAxisRotation,
          largeArcFlag,
          sweepFlag,
        }, curveSteps)

        currentX = endPoint.x
        currentY = endPoint.y
        prevControlX = null
        prevControlY = null
      }

      continue
    }

    throw new Error(`Unsupported SVG path command: ${cmd}`)
  }

  if (currentPolyline.length > 2) {
    polylines.push(currentPolyline)
  }

  return polylines
}

function tokenizePathData(d) {
  const regex = /([AaCcHhLlMmQqSsTtVvZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g
  const tokens = []

  for (const match of d.matchAll(regex)) {
    tokens.push(match[1] ?? match[2])
  }

  return tokens
}

function isCommandToken(token) {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token)
}

function hasNumber(tokens, index) {
  return index < tokens.length && !isCommandToken(tokens[index])
}

function readNumber(tokens, index) {
  const token = tokens[index]

  if (token === undefined || isCommandToken(token)) {
    throw new Error('Invalid path data: expected number token.')
  }

  const value = Number(token)

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric token in path data: ${token}`)
  }

  return value
}

function appendCubicCurve(polyline, p0, p1, p2, p3, steps) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const mt = 1 - t

    const x = (
      mt ** 3 * p0.x +
      3 * mt ** 2 * t * p1.x +
      3 * mt * t ** 2 * p2.x +
      t ** 3 * p3.x
    )

    const y = (
      mt ** 3 * p0.y +
      3 * mt ** 2 * t * p1.y +
      3 * mt * t ** 2 * p2.y +
      t ** 3 * p3.y
    )

    polyline.push({ x, y })
  }
}

function appendQuadraticCurve(polyline, p0, p1, p2, steps) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const mt = 1 - t

    const x = mt ** 2 * p0.x + 2 * mt * t * p1.x + t ** 2 * p2.x
    const y = mt ** 2 * p0.y + 2 * mt * t * p1.y + t ** 2 * p2.y

    polyline.push({ x, y })
  }
}

function appendArcFallback(polyline, start, end, arcArgs, steps) {
  void arcArgs

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    polyline.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    })
  }
}

function cleanupPolygon(vertices) {
  const clean = []

  for (const vertex of vertices) {
    const last = clean[clean.length - 1]

    if (last && nearlyEqual(last.x, vertex.x) && nearlyEqual(last.y, vertex.y)) {
      continue
    }

    clean.push(vertex)
  }

  if (clean.length > 2) {
    const first = clean[0]
    const last = clean[clean.length - 1]

    if (nearlyEqual(first.x, last.x) && nearlyEqual(first.y, last.y)) {
      clean.pop()
    }
  }

  return clean
}

function normalizePolygonWinding(polygon) {
  if (polygonArea(polygon) < 0) {
    return [...polygon].reverse()
  }

  return polygon
}

function polygonArea(polygon) {
  let area = 0

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}

function normalizeProvincesToViewport(provinces, svgBox) {
  const bounds = computeProvinceBounds(provinces)

  if (!bounds) {
    return {
      width: svgBox?.width ?? 1,
      height: svgBox?.height ?? 1,
      provinces,
    }
  }

  const offsetX = svgBox ? svgBox.minX : bounds.minX
  const offsetY = svgBox ? svgBox.minY : bounds.minY
  const width = svgBox ? svgBox.width : Math.max(1, bounds.maxX - bounds.minX)
  const height = svgBox ? svgBox.height : Math.max(1, bounds.maxY - bounds.minY)

  return {
    width,
    height,
    provinces: provinces.map((province) => ({
      ...province,
      vertices: province.vertices.map((vertex) => ({
        x: vertex.x - offsetX,
        y: vertex.y - offsetY,
      })),
    })),
  }
}

function computeProvinceBounds(provinces) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hasVertices = false

  for (const province of provinces) {
    for (const vertex of province.vertices) {
      hasVertices = true
      minX = Math.min(minX, vertex.x)
      minY = Math.min(minY, vertex.y)
      maxX = Math.max(maxX, vertex.x)
      maxY = Math.max(maxY, vertex.y)
    }
  }

  if (!hasVertices) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

function scaleProvincesToSize(provinces, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const safeSourceWidth = Math.max(1, sourceWidth)
  const safeSourceHeight = Math.max(1, sourceHeight)
  const scaleX = targetWidth / safeSourceWidth
  const scaleY = targetHeight / safeSourceHeight

  return provinces.map((province) => ({
    ...province,
    vertices: province.vertices.map((vertex) => ({
      x: vertex.x * scaleX,
      y: vertex.y * scaleY,
    })),
  }))
}

function parsePositiveNumber(value, fallbackValue) {
  const parsedValue = Number(value)

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue
  }

  return fallbackValue
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function nearlyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon
}
