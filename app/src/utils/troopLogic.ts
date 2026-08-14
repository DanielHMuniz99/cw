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

export function findShortestPath(
  startPointId: number,
  targetPointId: number,
  points: MapPointData[],
): number[] {
  if (startPointId === targetPointId) {
    return [startPointId]
  }

  const adjacency = getPointGraph(points)
  const queue: number[] = [startPointId]
  const visited = new Set<number>([startPointId])
  const previous = new Map<number, number | null>([[startPointId, null]])

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) {
      continue
    }

    const neighbors = adjacency.get(current) ?? []

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue
      }

      visited.add(neighbor)
      previous.set(neighbor, current)

      if (neighbor === targetPointId) {
        const path: number[] = [neighbor]
        let cursor: number | null = neighbor

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

      queue.push(neighbor)
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
