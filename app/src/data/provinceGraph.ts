import { provinces } from './provinces'

export const provinceGraph: Record<number, number[]> = Object.fromEntries(
  provinces.map((province) => [province.id, province.borders]),
)

export function findShortestProvincePath(startId: number, targetId: number): number[] {
  if (startId === targetId) {
    return [startId]
  }

  const visited = new Set<number>()
  const queue: Array<{ id: number; cost: number }> = [{ id: startId, cost: 0 }]
  const parent = new Map<number, number>()
  const distance = new Map<number, number>([[startId, 0]])

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const currentNode = queue.shift()
    if (!currentNode) {
      break
    }

    const current = currentNode.id
    if (visited.has(current)) {
      continue
    }

    visited.add(current)

    if (current === targetId) {
      break
    }

    const neighbors = provinceGraph[current] ?? []
    for (const next of neighbors) {
      if (visited.has(next)) {
        continue
      }

      const edgeCost = getEdgeCost(current, next)
      const nextCost = (distance.get(current) ?? Number.POSITIVE_INFINITY) + edgeCost
      const bestKnown = distance.get(next) ?? Number.POSITIVE_INFINITY

      if (nextCost >= bestKnown) {
        continue
      }

      distance.set(next, nextCost)
      parent.set(next, current)
      queue.push({ id: next, cost: nextCost })
    }
  }

  if (!parent.has(targetId)) {
    return []
  }

  const path: number[] = [targetId]
  let cursor = targetId

  while (cursor !== startId) {
    const previous = parent.get(cursor)
    if (previous === undefined) {
      return []
    }

    path.unshift(previous)
    cursor = previous
  }

  return path
}

function getEdgeCost(fromId: number, toId: number): number {
  const from = getProvinceCenter(fromId)
  const to = getProvinceCenter(toId)

  if (!from || !to) {
    return 1
  }

  const dx = Math.abs(from.x - to.x)
  const dy = Math.abs(from.y - to.y)

  // Prefer axis-aligned travel; diagonal is valid but slightly more expensive.
  const mostlyHorizontal = dy < dx * 0.45
  const mostlyVertical = dx < dy * 0.45

  return mostlyHorizontal || mostlyVertical ? 1 : 1.35
}

function getProvinceCenter(id: number): { x: number; y: number } | null {
  const province = provinces.find((item) => item.id === id)
  if (!province) {
    return null
  }

  return { x: province.centerX, y: province.centerY }
}
