export interface MapPointData {
  id: number
  name?: string
  x: number
  y: number
  borders?: number[]
  country_id?: number | string | null
}

export interface MapJsonData {
  schemaVersion?: number
  createdAt?: string
  width?: number
  height?: number
  overlayImage?: string | null
  points?: MapPointData[]
}

export function normalizeMapJson(data: unknown): MapJsonData {
  if (!data || typeof data !== 'object') {
    return { width: 1200, height: 800, points: [] }
  }

  const candidate = data as Record<string, unknown>

  return {
    schemaVersion: typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    width: typeof candidate.width === 'number' ? candidate.width : 1200,
    height: typeof candidate.height === 'number' ? candidate.height : 800,
    overlayImage: typeof candidate.overlayImage === 'string' || candidate.overlayImage === null ? candidate.overlayImage : null,
    points: Array.isArray(candidate.points)
      ? candidate.points.filter((point): point is MapPointData => {
          if (!point || typeof point !== 'object') {
            return false
          }

          const entry = point as Record<string, unknown>
          return typeof entry.id === 'number' && typeof entry.x === 'number' && typeof entry.y === 'number'
        })
      : [],
  }
}

export function buildBorderSegments(points: MapPointData[]) {
  const index = new Map(points.map((point) => [point.id, point]))
  const segments: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
  const seen = new Set<string>()

  for (const point of points) {
    const borders = point.borders ?? []

    for (const borderId of borders) {
      const neighbor = index.get(borderId)
      if (!neighbor) {
        continue
      }

      const minId = Math.min(point.id, neighbor.id)
      const maxId = Math.max(point.id, neighbor.id)
      const key = `${minId}-${maxId}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      segments.push({
        key,
        x1: point.x,
        y1: point.y,
        x2: neighbor.x,
        y2: neighbor.y,
      })
    }
  }

  return segments
}
