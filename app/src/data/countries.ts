export const countryColors: Record<string, string> = {
  Asteria: '#2563eb',
  Volmark: '#dc2626',
}

export function getCountryColor(country: string): string {
  return countryColors[country] ?? '#6b7280'
}
