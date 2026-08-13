import type { LoggedPlayer } from '../types/game'

const mockPlayers: LoggedPlayer[] = [
  { userId: 1, username: 'marshal_asteria', controlledCountry: 'Asteria' },
  { userId: 2, username: 'general_volmark', controlledCountry: 'Volmark' },
]

export const availablePlayers: LoggedPlayer[] = [...mockPlayers]

const SESSION_USER_ID_KEY = 'prototype:logged-user-id'
const SESSION_GAME_TIME_SCALE_KEY = 'prototype:game-time-scale'
const DEFAULT_GAME_TIME_SCALE = 2

export function getLoggedPlayer(): LoggedPlayer {
  const savedId = Number(localStorage.getItem(SESSION_USER_ID_KEY))
  const bySavedId = mockPlayers.find((player) => player.userId === savedId)

  if (bySavedId) {
    return bySavedId
  }

  const fallback = mockPlayers[0]
  localStorage.setItem(SESSION_USER_ID_KEY, String(fallback.userId))
  return fallback
}

export function setLoggedPlayer(userId: number): LoggedPlayer {
  const player = mockPlayers.find((item) => item.userId === userId) ?? mockPlayers[0]
  localStorage.setItem(SESSION_USER_ID_KEY, String(player.userId))
  return player
}

export function getGameTimeScale(): number {
  const stored = Number(localStorage.getItem(SESSION_GAME_TIME_SCALE_KEY))
  if (Number.isFinite(stored) && stored > 0) {
    return stored
  }

  localStorage.setItem(SESSION_GAME_TIME_SCALE_KEY, String(DEFAULT_GAME_TIME_SCALE))
  return DEFAULT_GAME_TIME_SCALE
}

export function setGameTimeScale(value: number): number {
  const safeValue = Number.isFinite(value) && value > 0 ? value : DEFAULT_GAME_TIME_SCALE
  localStorage.setItem(SESSION_GAME_TIME_SCALE_KEY, String(safeValue))
  return safeValue
}
