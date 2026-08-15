import type { MapPointData } from './mapData'

export type CombatCountry = 'blue' | 'red'

export interface CombatTroop {
  id: number
  country: CombatCountry
  pointId: number | null
  label: string
  speed?: number
}

export function getNextTroopId(troops: CombatTroop[]) {
  return troops.reduce((maxId, troop) => Math.max(maxId, troop.id), 0) + 1
}

export function getPointGraph(points: MapPointData[]) {
  const adjacency = new Map<number, number[]>()

  for (const point of points) {
    adjacency.set(point.id, [...(point.borders ?? [])])
  }

  return adjacency
}

function getVectorLength(x: number, y: number) {
  return Math.hypot(x, y)
}

function normalizeVector(x: number, y: number) {
  const length = getVectorLength(x, y)
  if (length === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: x / length,
    y: y / length,
  }
}

function getTurnPenalty(previousDirection: { x: number; y: number } | null, nextDirection: { x: number; y: number }) {
  if (!previousDirection || (previousDirection.x === 0 && previousDirection.y === 0)) {
    return 0
  }

  const previous = normalizeVector(previousDirection.x, previousDirection.y)
  const next = normalizeVector(nextDirection.x, nextDirection.y)
  const dot = previous.x * next.x + previous.y * next.y
  const angleRadians = Math.acos(Math.max(-1, Math.min(1, dot)))
  const angleDegrees = (angleRadians * 180) / Math.PI
  const toleranceDegrees = 18

  if (angleDegrees <= toleranceDegrees) {
    return 0
  }

  return (angleDegrees - toleranceDegrees) * 1.5
}

export function findShortestPath(
  startPointId: number,
  targetPointId: number,
  points: MapPointData[],
): number[] {
  if (startPointId === targetPointId) {
    return [startPointId]
  }

  const pointMap = new Map(points.map((point) => [point.id, point]))
  const adjacency = getPointGraph(points)
  const frontier: Array<{ id: number; cost: number }> = [{ id: startPointId, cost: 0 }]
  const bestCost = new Map<number, number>([[startPointId, 0]])
  const previous = new Map<number, number | null>([[startPointId, null]])
  const previousDirection = new Map<number, { x: number; y: number } | null>([[startPointId, null]])

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.cost - right.cost)
    const current = frontier.shift()
    if (current === undefined) {
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

    const currentPoint = pointMap.get(current.id)
    if (!currentPoint) {
      continue
    }

    const currentMove = previousDirection.get(current.id) ?? null
    const neighbors = adjacency.get(current.id) ?? []

    for (const neighbor of neighbors) {
      const neighborPoint = pointMap.get(neighbor)
      if (!neighborPoint) {
        continue
      }

      const deltaX = neighborPoint.x - currentPoint.x
      const deltaY = neighborPoint.y - currentPoint.y
      const movementCost = Math.hypot(deltaX, deltaY) + getTurnPenalty(currentMove, { x: deltaX, y: deltaY })
      const candidateCost = current.cost + movementCost
      const currentBest = bestCost.get(neighbor)

      if (currentBest !== undefined && candidateCost >= currentBest) {
        continue
      }

      bestCost.set(neighbor, candidateCost)
      previous.set(neighbor, current.id)
      previousDirection.set(neighbor, { x: deltaX, y: deltaY })
      frontier.push({ id: neighbor, cost: candidateCost })
    }
  }

  return []
}

export function isPointOccupied(troops: CombatTroop[], pointId: number | null) {
  return troops.some((troop) => troop.pointId === pointId)
}

export function getAvailablePointId(points: MapPointData[], troops: CombatTroop[]) {
  for (const point of points) {
    if (!isPointOccupied(troops, point.id)) {
      return point.id
    }
  }

  return null
}

export function moveTroopToPoint(
  troops: CombatTroop[],
  troopId: number,
  targetPointId: number,
  points: MapPointData[],
) {
  const troop = troops.find((item) => item.id === troopId)
  if (!troop || troop.pointId === null) {
    return troops
  }

  if (troop.pointId === targetPointId) {
    return troops
  }

  if (isPointOccupied(troops, targetPointId) && targetPointId !== troop.pointId) {
    return troops
  }

  const path = findShortestPath(troop.pointId, targetPointId, points)
  if (path.length === 0) {
    return troops
  }

  return troops.map((item) => {
    if (item.id !== troopId) {
      return item
    }

    return {
      ...item,
      pointId: targetPointId,
    }
  })
}
