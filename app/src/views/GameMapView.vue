<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Army, CombatIndicator, Province } from '../types/game'
import GameMap from '../components/game/GameMap.vue'
import ProvincePanel from '../components/game/ProvincePanel.vue'
import { provinces as defaultMapProvinces } from '../data/provinces'
import { provinces as generatedWorldProvinces } from '../data/generatedWorldMap'
import { armies } from '../data/armies'
import { getCountryColor } from '../data/countries'
import { getGameTimeScale, getLoggedPlayer } from '../data/session'
import { useGameMapStore } from '../stores/gameMap'

const props = defineProps<{
  mapVariant?: 'default' | 'world'
}>()

const mapStore = useGameMapStore()
const baseMapProvinces = props.mapVariant === 'world' ? generatedWorldProvinces : defaultMapProvinces
const provincesState = ref(baseMapProvinces.map((province) => ({ ...province })))
const armiesState = ref<Army[]>(createInitialArmies(provincesState.value))
const debugControlledCountry = ref(getLoggedPlayer().controlledCountry)
const gameTimeScale = Math.max(0.1, getGameTimeScale())
const COMBAT_TICK_BASE_MS = 10_000
const COMBAT_TICK_MS = Math.max(250, Math.round(COMBAT_TICK_BASE_MS / gameTimeScale))
let combatIntervalId: number | null = null
const activeCombatProvinces = new Set<number>()
const defaultOwnerColors: Record<string, string> = {
  player: '#3b82f6',
  ally: '#22c55e',
  enemy: '#ef4444',
  neutral: '#6b7280',
}
const combatProvinceAttackers = new Map<number, string>()
syncArmiesToProvinceCenters(armiesState.value)

const controlledCountry = computed(() => debugControlledCountry.value)
const availableCountries = computed(() => {
  const countries = new Set(armiesState.value.map((army) => army.country))
  return Array.from(countries)
})

const selectedProvince = computed(() => {
  if (!mapStore.selectedProvinceId) {
    return null
  }

  return provincesState.value.find((province) => province.id === mapStore.selectedProvinceId) ?? null
})

const selectedArmy = computed(() => {
  if (!mapStore.selectedArmyId) {
    return null
  }

  return armiesState.value.find((army) => army.id === mapStore.selectedArmyId) ?? null
})

const previewPathProvinceIds = computed(() => {
  if (!mapStore.isMoveMode || !selectedArmy.value || mapStore.hoveredProvinceId === null) {
    return []
  }

  const targetProvinceId = mapStore.hoveredProvinceId
  if (targetProvinceId === selectedArmy.value.provinceId) {
    return []
  }

  return findShortestProvincePathOnMap(
    provincesState.value,
    selectedArmy.value.provinceId,
    targetProvinceId,
  )
})

const previewPath = computed(() => {
  return previewPathProvinceIds.value
    .map((provinceId) => provincesState.value.find((province) => province.id === provinceId) ?? null)
    .filter((province): province is Province => province !== null)
})

const mapViewBox = computed(() => {
  if (provincesState.value.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 1100,
      height: 620,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const province of provincesState.value) {
    minX = Math.min(minX, province.centerX)
    minY = Math.min(minY, province.centerY)
    maxX = Math.max(maxX, province.centerX)
    maxY = Math.max(maxY, province.centerY)
  }

  const padding = props.mapVariant === 'world' ? 220 : 100

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  }
})

const initialMapScale = computed(() => (props.mapVariant === 'world' ? 1.2 : 1))

const combatIndicators = computed<CombatIndicator[]>(() => {
  const indicators: CombatIndicator[] = []
  const provincesWithUnits = new Set(armiesState.value.map((army) => army.provinceId))

  for (const provinceId of provincesWithUnits) {
    const units = armiesState.value.filter((army) => army.provinceId === provinceId && army.health > 0)
    const countries = new Set(units.map((army) => army.country))

    if (countries.size < 2) {
      continue
    }

    const myUnits = units.filter((army) => army.country === controlledCountry.value)
    if (myUnits.length === 0) {
      continue
    }

    const enemyUnits = units.filter((army) => army.country !== controlledCountry.value)
    const myPower = myUnits.reduce((total, unit) => total + getArmyCombatPower(unit), 0)
    const enemyPower = enemyUnits.reduce((total, unit) => total + getArmyCombatPower(unit), 0)

    const totalPower = myPower + enemyPower
    const winProbability = totalPower > 0
      ? Math.round((myPower / totalPower) * 100)
      : 50

    const score = totalPower > 0
      ? Math.round(Math.min(100, Math.max(0, 50 + ((myPower - enemyPower) / totalPower) * 50)))
      : 50

    const province = provincesState.value.find((item) => item.id === provinceId)
    if (!province) {
      continue
    }

    let borderColor = '#16a34a'
    if (winProbability <= 33) {
      borderColor = '#dc2626'
    } else if (winProbability <= 66) {
      borderColor = '#facc15'
    }

    indicators.push({
      provinceId,
      x: province.centerX,
      y: province.centerY,
      score,
      winProbability,
      borderColor,
    })
  }

  return indicators
})

const canMoveSelectedArmy = computed(() => {
  if (!selectedArmy.value) {
    return false
  }

  return selectedArmy.value.country === controlledCountry.value && !selectedArmy.value.isMoving && !selectedArmy.value.inCombat
})

const canPromoteSelectedArmyToAttack = computed(() => {
  if (!selectedArmy.value) {
    return false
  }

  return (
    selectedArmy.value.country === controlledCountry.value
    && selectedArmy.value.inCombat
    && selectedArmy.value.combatMode === 'defense'
  )
})

const moveDisabledReason = computed(() => {
  if (!selectedArmy.value) {
    return null
  }

  if (selectedArmy.value.isMoving) {
    return 'Unidade em deslocamento. Aguarde concluir a rota para mover novamente.'
  }

  if (selectedArmy.value.inCombat) {
    return 'Unidade em combate. Movimento bloqueado ate o confronto terminar.'
  }

  if (selectedArmy.value.country !== controlledCountry.value) {
    return `Unidade de ${selectedArmy.value.country}. Voce controla ${controlledCountry.value}.`
  }

  return null
})

function handleControlledCountryChange(event: Event) {
  const selectElement = event.target as HTMLSelectElement
  debugControlledCountry.value = selectElement.value
  mapStore.disableMoveMode()
}

function handleProvinceSelect(provinceId: number) {
  if (mapStore.isMoveMode && mapStore.selectedArmyId !== null) {
    const movingArmy = armiesState.value.find((army) => army.id === mapStore.selectedArmyId)
    const route = movingArmy
      ? findShortestProvincePathOnMap(provincesState.value, movingArmy.provinceId, provinceId)
      : []

    if (movingArmy && movingArmy.country === controlledCountry.value && !movingArmy.inCombat && route.length > 1) {
      moveArmyAlongPath(movingArmy, route)
    }

    mapStore.disableMoveMode()
    return
  }

  mapStore.selectProvince(provinceId)
}

function handleArmySelect(armyId: number) {
  mapStore.selectArmy(armyId)

  const army = armiesState.value.find((unit) => unit.id === armyId)
  if (!army || army.country !== controlledCountry.value) {
    mapStore.disableMoveMode()
  }
}

function handleStartMove() {
  if (canMoveSelectedArmy.value) {
    mapStore.enableMoveMode()
  }
}

function handleSetArmyToAttack() {
  if (!selectedArmy.value || !canPromoteSelectedArmyToAttack.value) {
    return
  }

  selectedArmy.value.combatMode = 'attack'
}

function handleClearSelection() {
  mapStore.clearSelection()
}

function getOwnerColor(owner: string): string {
  return defaultOwnerColors[owner] ?? getCountryColor(owner)
}

function conquerProvince(provinceId: number, country: string) {
  const province = provincesState.value.find((item) => item.id === provinceId)
  if (!province || province.owner === country) {
    return
  }

  province.owner = country
  province.color = getOwnerColor(country)
}

function getProvinceCenter(provinceId: number) {
  return provincesState.value.find((item) => item.id === provinceId)
}

function centerArmyOnProvince(army: Army, provinceId: number) {
  const province = getProvinceCenter(provinceId)
  if (!province) {
    return
  }

  army.x = province.centerX
  army.y = province.centerY
}

function positionCombatUnits(provinceId: number) {
  const province = getProvinceCenter(provinceId)
  if (!province) {
    return
  }

  const attackerCountry = combatProvinceAttackers.get(provinceId)
  const unitsInProvince = armiesState.value.filter((army) => army.provinceId === provinceId && army.health > 0)

  if (unitsInProvince.length < 2) {
    for (const unit of unitsInProvince) {
      centerArmyOnProvince(unit, provinceId)
    }
    return
  }

  const countries = Array.from(new Set(unitsInProvince.map((army) => army.country)))
  const leftCountry = attackerCountry ?? countries[0]
  const rightCountry = countries.find((country) => country !== leftCountry) ?? leftCountry

  const leftUnits = unitsInProvince.filter((army) => army.country === leftCountry)
  const rightUnits = unitsInProvince.filter((army) => army.country === rightCountry)

  const spreadUnits = (units: Army[], direction: -1 | 1) => {
    const count = units.length
    const step = 18
    const baseX = 30
    const startY = -((count - 1) * step) / 2

    units.forEach((unit, index) => {
      unit.x = province.centerX + direction * baseX
      unit.y = province.centerY + startY + index * step
    })
  }

  spreadUnits(leftUnits, -1)
  spreadUnits(rightUnits, 1)
}

function recenterProvinceWinner(provinceId: number, country: string) {
  const units = armiesState.value.filter((army) => army.provinceId === provinceId && army.country === country && army.health > 0)

  for (const unit of units) {
    centerArmyOnProvince(unit, provinceId)
    unit.inCombat = false
    if (!unit.isMoving) {
      unit.combatMode = 'defense'
    }
  }

  combatProvinceAttackers.delete(provinceId)
}

function syncArmiesToProvinceCenters(armiesList: Army[]) {
  for (const army of armiesList) {
    const province = provincesState.value.find((item) => item.id === army.provinceId)
    if (!province) {
      continue
    }

    army.x = province.centerX
    army.y = province.centerY
  }
}

function createInitialArmies(mapProvinces: Province[]): Army[] {
  const existingProvinceIds = new Set(mapProvinces.map((province) => province.id))
  const mappedArmies = armies
    .filter((army) => existingProvinceIds.has(army.provinceId))
    .map((unit) => ({ ...unit }))

  if (mappedArmies.length >= 2) {
    return mappedArmies
  }

  const sorted = [...mapProvinces].sort((a, b) => a.id - b.id)
  if (sorted.length < 2) {
    return []
  }

  const first = sorted[0]
  const mid = sorted[Math.floor(sorted.length / 2)]
  const last = sorted[sorted.length - 1]

  const fallbackArmies: Army[] = [
    {
      id: 1,
      name: '1st Vanguard',
      country: 'Asteria',
      type: 'Infantry',
      attack: 26,
      defense: 22,
      speed: 900,
      maxHealth: 100,
      health: 100,
      combatMode: 'defense',
      inCombat: false,
      isMoving: false,
      provinceId: first.id,
      x: first.centerX,
      y: first.centerY,
    },
    {
      id: 2,
      name: '2nd Steel',
      country: 'Asteria',
      type: 'Tank',
      attack: 38,
      defense: 34,
      speed: 700,
      maxHealth: 100,
      health: 100,
      combatMode: 'defense',
      inCombat: false,
      isMoving: false,
      provinceId: mid.id,
      x: mid.centerX,
      y: mid.centerY,
    },
    {
      id: 3,
      name: '3rd Shield',
      country: 'Volmark',
      type: 'Infantry',
      attack: 24,
      defense: 24,
      speed: 900,
      maxHealth: 100,
      health: 100,
      combatMode: 'defense',
      inCombat: false,
      isMoving: false,
      provinceId: last.id,
      x: last.centerX,
      y: last.centerY,
    },
  ]

  return fallbackArmies
}

function findShortestProvincePathOnMap(
  mapProvinces: Province[],
  startId: number,
  targetId: number,
): number[] {
  if (startId === targetId) {
    return [startId]
  }

  const graph: Record<number, number[]> = Object.fromEntries(
    mapProvinces.map((province) => [province.id, province.borders ?? []]),
  )

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

    const neighbors = graph[current] ?? []
    for (const next of neighbors) {
      if (visited.has(next)) {
        continue
      }

      const edgeCost = getEdgeCostInMap(mapProvinces, current, next)
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

function getEdgeCostInMap(mapProvinces: Province[], fromId: number, toId: number): number {
  const from = mapProvinces.find((item) => item.id === fromId)
  const to = mapProvinces.find((item) => item.id === toId)

  if (!from || !to) {
    return 1
  }

  const dx = Math.abs(from.centerX - to.centerX)
  const dy = Math.abs(from.centerY - to.centerY)
  const mostlyHorizontal = dy < dx * 0.45
  const mostlyVertical = dx < dy * 0.45

  return mostlyHorizontal || mostlyVertical ? 1 : 1.35
}

function animateArmyToProvince(army: Army, targetX: number, targetY: number, durationMs: number) {
  return new Promise<boolean>((resolve) => {
    const startX = army.x
    const startY = army.y
    const startTime = performance.now()

    const step = (now: number) => {
      if (army.health <= 0 || army.inCombat) {
        resolve(false)
        return
      }

      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / durationMs)

      army.x = startX + (targetX - startX) * progress
      army.y = startY + (targetY - startY) * progress

      if (progress >= 1) {
        resolve(true)
        return
      }

      window.requestAnimationFrame(step)
    }

    window.requestAnimationFrame(step)
  })
}

async function moveArmyAlongPath(army: Army, path: number[]) {
  if (army.inCombat || army.health <= 0) {
    return
  }

  army.isMoving = true
  army.combatMode = 'attack'

  for (const provinceId of path.slice(1)) {
    if (army.health <= 0 || army.inCombat) {
      army.isMoving = false
      return
    }

    const nextProvince = provincesState.value.find((province) => province.id === provinceId)
    if (!nextProvince) {
      continue
    }

    const moveDurationMs = Math.max(80, Math.round(army.speed / gameTimeScale))
    const moved = await animateArmyToProvince(army, nextProvince.centerX, nextProvince.centerY, moveDurationMs)
    if (!moved) {
      army.isMoving = false
      return
    }

    army.provinceId = nextProvince.id

    const enemiesInProvince = findEnemyUnitsInProvince(army, army.provinceId)
    if (enemiesInProvince.length > 0) {
      startCombatForProvince(army.provinceId, army.country)
      break
    }

    conquerProvince(army.provinceId, army.country)
  }

  army.isMoving = false
  if (!army.inCombat) {
    army.combatMode = 'defense'
  }
}

function findEnemyUnitsInProvince(army: Army, provinceId: number): Army[] {
  return armiesState.value.filter((candidate) => {
    return (
      candidate.provinceId === provinceId
      && candidate.country !== army.country
      && candidate.health > 0
    )
  })
}

function startCombatForProvince(provinceId: number, attackerCountry: string) {
  const unitsInProvince = armiesState.value.filter((army) => army.provinceId === provinceId && army.health > 0)
  const countryCount = new Set(unitsInProvince.map((army) => army.country)).size

  if (countryCount < 2) {
    return
  }

  activeCombatProvinces.add(provinceId)
  combatProvinceAttackers.set(provinceId, attackerCountry)

  for (const unit of unitsInProvince) {
    unit.inCombat = true
    unit.isMoving = false
    if (unit.country !== attackerCountry && unit.combatMode !== 'attack') {
      unit.combatMode = 'defense'
    }
  }

  // Apply immediate separation so units do not overlap before the first combat tick.
  positionCombatUnits(provinceId)
}

function getEffectiveAttack(unit: Army): number {
  return unit.attack * (unit.health / unit.maxHealth)
}

function getEffectiveDefense(unit: Army): number {
  return unit.defense * (unit.health / unit.maxHealth)
}

function getArmyCombatPower(unit: Army): number {
  const stanceAttackMultiplier = unit.combatMode === 'attack' ? 1 : 0.82
  const stanceDefenseMultiplier = unit.combatMode === 'defense' ? 1 : 0.9
  const effectiveAttack = getEffectiveAttack(unit) * stanceAttackMultiplier
  const effectiveDefense = getEffectiveDefense(unit) * stanceDefenseMultiplier

  return effectiveAttack + effectiveDefense * 0.65
}

function applyCombatDamage(attacker: Army, target: Army) {
  const attackerPower = getEffectiveAttack(attacker)
  const defenderPower = getEffectiveDefense(target)
  const attackDamage = Math.max(1, Math.round(attackerPower - defenderPower * 0.35))

  target.health = Math.max(0, target.health - attackDamage)

  if (target.health <= 0) {
    return
  }

  const counterAttackPower = getEffectiveAttack(target)
  const attackerDefensePower = getEffectiveDefense(attacker)
  const counterMultiplier = target.combatMode === 'defense' ? 0.75 : 1
  const counterDamage = Math.max(1, Math.round(counterAttackPower * counterMultiplier - attackerDefensePower * 0.25))

  attacker.health = Math.max(0, attacker.health - counterDamage)
}

function resolveCombatTick() {
  const provincesWithUnits = new Set(armiesState.value.map((army) => army.provinceId))

  for (const provinceId of provincesWithUnits) {
    const unitsInProvince = armiesState.value.filter((army) => army.provinceId === provinceId && army.health > 0)
    const countriesInProvince = new Set(unitsInProvince.map((army) => army.country))

    if (countriesInProvince.size < 2) {
      if (activeCombatProvinces.has(provinceId)) {
        if (unitsInProvince.length > 0) {
          conquerProvince(provinceId, unitsInProvince[0].country)
          recenterProvinceWinner(provinceId, unitsInProvince[0].country)
        }

        activeCombatProvinces.delete(provinceId)
      }

      for (const unit of unitsInProvince) {
        unit.inCombat = false
        if (!unit.isMoving) {
          unit.combatMode = 'defense'
          centerArmyOnProvince(unit, provinceId)
        }
      }
      continue
    }

    for (const unit of unitsInProvince) {
      unit.inCombat = true
      unit.isMoving = false
    }

    activeCombatProvinces.add(provinceId)
    if (!combatProvinceAttackers.has(provinceId)) {
      const attackUnit = unitsInProvince.find((unit) => unit.combatMode === 'attack')
      if (attackUnit) {
        combatProvinceAttackers.set(provinceId, attackUnit.country)
      }
    }

    positionCombatUnits(provinceId)

    const attackers = unitsInProvince.filter((unit) => unit.combatMode === 'attack' && unit.health > 0)
    for (const attacker of attackers) {
      if (attacker.health <= 0) {
        continue
      }

      const possibleTargets = unitsInProvince
        .filter((unit) => unit.country !== attacker.country && unit.health > 0)
        .sort((a, b) => a.health - b.health)

      const target = possibleTargets[0]
      if (!target) {
        continue
      }

      applyCombatDamage(attacker, target)
    }

    const survivors = unitsInProvince.filter((unit) => unit.health > 0)
    const survivorCountries = new Set(survivors.map((unit) => unit.country))
    if (survivorCountries.size <= 1) {
      if (survivors.length > 0) {
        conquerProvince(provinceId, survivors[0].country)
        recenterProvinceWinner(provinceId, survivors[0].country)
      }

      activeCombatProvinces.delete(provinceId)
    }
  }

  armiesState.value = armiesState.value.filter((army) => army.health > 0)

  if (mapStore.selectedArmyId !== null) {
    const selectedExists = armiesState.value.some((army) => army.id === mapStore.selectedArmyId)
    if (!selectedExists) {
      mapStore.clearSelection()
    }
  }
}

onMounted(() => {
  combatIntervalId = window.setInterval(() => {
    resolveCombatTick()
  }, COMBAT_TICK_MS)
})

onBeforeUnmount(() => {
  if (combatIntervalId !== null) {
    window.clearInterval(combatIntervalId)
  }
})
</script>

<template>
  <main class="game-map-view">
    <section class="map-stage">
      <header class="title-bar">
        <div>
          <p class="eyebrow">Prototipo Visual</p>
          <h1>Mapa Estrategico</h1>
        </div>
        <div class="header-right">
          <label class="debug-country-switch">
            <span>Debug: pais controlado</span>
            <select :value="controlledCountry" @change="handleControlledCountryChange">
              <option v-for="country in availableCountries" :key="country" :value="country">
                {{ country }}
              </option>
            </select>
          </label>
          <p class="hint">Ferramenta de debug: voce controla {{ controlledCountry }}. Apenas esse exercito pode mover.</p>
        </div>
      </header>

      <div class="map-and-panel">
        <div class="map-canvas">
          <GameMap
            :provinces="provincesState"
            :armies="armiesState"
            :selected-province-id="mapStore.selectedProvinceId"
            :selected-army-id="mapStore.selectedArmyId"
            :hovered-province-id="mapStore.hoveredProvinceId"
            :preview-path="previewPath"
            :combat-indicators="combatIndicators"
            :map-view-box="mapViewBox"
            :initial-scale="initialMapScale"
            @select-province="handleProvinceSelect"
            @select-army="handleArmySelect"
            @hover-province="mapStore.setHoveredProvince"
            @clear-selection="handleClearSelection"
          />
        </div>

        <ProvincePanel
          :province="selectedProvince"
          :army="selectedArmy"
          :is-move-mode="mapStore.isMoveMode"
          :can-move-selected-army="canMoveSelectedArmy"
          :can-promote-selected-army-to-attack="canPromoteSelectedArmyToAttack"
          :move-disabled-reason="moveDisabledReason"
          @start-move="handleStartMove"
          @cancel-move="mapStore.disableMoveMode"
          @set-attack-mode="handleSetArmyToAttack"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.game-map-view {
  min-height: 100vh;
  padding: 1.1rem;
  box-sizing: border-box;
  background:
    linear-gradient(140deg, #0b1224 0%, #111827 45%, #1f2937 100%);
  color: #e2e8f0;
}

.map-stage {
  max-width: 1300px;
  margin: 0 auto;
  display: grid;
  gap: 0.9rem;
}

.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: end;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.65);
  padding: 0.9rem 1rem;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #93c5fd;
  font-size: 0.75rem;
}

h1 {
  margin: 0.15rem 0 0;
  font-size: clamp(1.1rem, 1.9vw, 1.8rem);
}

.hint {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.95rem;
}

.header-right {
  display: grid;
  gap: 0.4rem;
  justify-items: end;
}

.debug-country-switch {
  display: grid;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: #93c5fd;
}

.debug-country-switch select {
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.45rem;
  padding: 0.35rem 0.5rem;
}

.map-and-panel {
  display: flex;
  height: calc(100vh - 165px);
  min-height: 780px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.9rem;
  overflow: hidden;
}

.map-canvas {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1000px) {
  .title-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .header-right {
    justify-items: start;
  }

  .map-and-panel {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .map-canvas {
    min-height: 62vh;
  }
}
</style>
