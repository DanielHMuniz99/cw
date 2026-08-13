import { defineStore } from 'pinia'

interface GameMapState {
  selectedProvinceId: number | null
  selectedArmyId: number | null
  hoveredProvinceId: number | null
  isMoveMode: boolean
}

export const useGameMapStore = defineStore('gameMap', {
  state: (): GameMapState => ({
    selectedProvinceId: null,
    selectedArmyId: null,
    hoveredProvinceId: null,
    isMoveMode: false,
  }),
  actions: {
    selectProvince(id: number | null) {
      this.selectedProvinceId = id
      this.selectedArmyId = null
      this.isMoveMode = false
    },
    selectArmy(id: number | null) {
      this.selectedArmyId = id
      this.selectedProvinceId = null
      if (id === null) {
        this.isMoveMode = false
      }
    },
    setHoveredProvince(id: number | null) {
      this.hoveredProvinceId = id
    },
    enableMoveMode() {
      if (this.selectedArmyId !== null) {
        this.isMoveMode = true
      }
    },
    disableMoveMode() {
      this.isMoveMode = false
    },
    clearSelection() {
      this.selectedProvinceId = null
      this.selectedArmyId = null
      this.isMoveMode = false
    },
  },
})
