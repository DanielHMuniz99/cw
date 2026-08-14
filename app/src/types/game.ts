export type ProvinceOwner = 'player' | 'ally' | 'enemy' | 'neutral' | string

export interface Country {
  id?: number
  name: string
  color?: string
}

export interface Troop {
  id?: number
  name?: string
  country_id: number | string | null
  province_id?: number | null
  type?: string
  health?: number
}

export interface MapProvinceData {
  id: number
  name: string
  owner: ProvinceOwner
  color: string
  points: string
  centerX: number
  centerY: number
  borders: number[]
  country_id?: number | string | null
}

export interface Province extends MapProvinceData {}

export interface GameMapData {
  provinces: Array<Omit<MapProvinceData, 'color'> & { color?: string }>
}

export interface Army {
  id: number
  name: string
  country: string
  type: 'Infantry' | 'Tank' | 'Artillery'
  attack: number
  defense: number
  speed: number
  maxHealth: number
  health: number
  combatMode: 'attack' | 'defense'
  inCombat: boolean
  provinceId: number
  x: number
  y: number
  isMoving: boolean
}

export interface LoggedPlayer {
  userId: number
  username: string
  controlledCountry: string
}

export interface CombatIndicator {
  provinceId: number
  x: number
  y: number
  score: number
  winProbability: number
  borderColor: string
}
