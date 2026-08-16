export interface CountryColorSet {
  province: string
  battalion: string
  division: string
  divisionSelected: string
  divisionStroke: string
  routePreview: string
}

export const MAP_THEME = {
  frontlineStroke: '#fbbf24',
  selectionStroke: '#f8fafc',
  frontlineGlow: 'rgba(251, 191, 36, 0.85)',
} as const

const defaultCountryColors: CountryColorSet = {
  province: '#94a3b8',
  battalion: '#94a3b8',
  division: '#64748b',
  divisionSelected: '#475569',
  divisionStroke: '#1e293b',
  routePreview: '#cbd5e1',
}

const countryColorsById: Record<number, CountryColorSet> = {
  1: {
    province: '#60a5fa',
    battalion: '#3b82f6',
    division: '#1d4ed8',
    divisionSelected: '#1e40af',
    divisionStroke: '#102a69',
    routePreview: '#93c5fd',
  },
  2: {
    province: '#f87171',
    battalion: '#ef4444',
    division: '#b91c1c',
    divisionSelected: '#991b1b',
    divisionStroke: '#5f1111',
    routePreview: '#fca5a5',
  },
  3: {
    province: '#4ade80',
    battalion: '#22c55e',
    division: '#15803d',
    divisionSelected: '#166534',
    divisionStroke: '#0b3a21',
    routePreview: '#86efac',
  },
  4: {
    province: '#fbbf24',
    battalion: '#f59e0b',
    division: '#b45309',
    divisionSelected: '#92400e',
    divisionStroke: '#552407',
    routePreview: '#fcd34d',
  },
  5: {
    province: '#a78bfa',
    battalion: '#8b5cf6',
    division: '#6d28d9',
    divisionSelected: '#5b21b6',
    divisionStroke: '#35156d',
    routePreview: '#c4b5fd',
  },
  6: {
    province: '#f472b6',
    battalion: '#ec4899',
    division: '#be185d',
    divisionSelected: '#9d174d',
    divisionStroke: '#590b2b',
    routePreview: '#f9a8d4',
  },
  7: {
    province: '#47d8c5',
    battalion: '#14b8a6',
    division: '#0f766e',
    divisionSelected: '#115e59',
    divisionStroke: '#0b3633',
    routePreview: '#5eead4',
  },
}

function normalizeCountryId(countryId: number | string | null | undefined) {
  if (countryId === null || countryId === undefined || countryId === '') {
    return null
  }

  if (typeof countryId === 'number' && Number.isFinite(countryId)) {
    return countryId
  }

  if (typeof countryId === 'string') {
    const parsed = Number(countryId.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function getCountryColorSet(countryId: number | string | null | undefined) {
  const normalizedCountryId = normalizeCountryId(countryId)
  if (normalizedCountryId === null) {
    return defaultCountryColors
  }

  return countryColorsById[normalizedCountryId] ?? defaultCountryColors
}

export function getProvinceColor(countryId: number | string | null | undefined) {
  return getCountryColorSet(countryId).province
}

export function getBattalionColor(countryId: number | string | null | undefined) {
  return getCountryColorSet(countryId).battalion
}

export function getDivisionFillColor(countryId: number | string | null | undefined, isSelected = false) {
  const colors = getCountryColorSet(countryId)
  return isSelected ? colors.divisionSelected : colors.division
}

export function getDivisionStrokeColor(countryId: number | string | null | undefined) {
  return getCountryColorSet(countryId).divisionStroke
}

export function getRoutePreviewColor(countryId: number | string | null | undefined) {
  return getCountryColorSet(countryId).routePreview
}
