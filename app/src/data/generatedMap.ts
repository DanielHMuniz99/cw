import type { GameMapData, Province } from '../types/game'

const ownerColorMap: Record<string, string> = {
  player: '#3b82f6',
  ally: '#22c55e',
  enemy: '#ef4444',
  neutral: '#6b7280',
}

export const gameMapData: GameMapData = {
  provinces: [
  {
    "id": 1,
    "name": "Northwatch",
    "owner": "neutral",
    "points": "36,36 235,36 254,224 36,201",
    "centerX": 140,
    "centerY": 124,
    "borders": [2, 6, 7]
  },
  {
    "id": 2,
    "name": "High Ridge",
    "owner": "neutral",
    "points": "235,36 413,36 430,201 254,224",
    "centerX": 333,
    "centerY": 124,
    "borders": [1, 3, 6, 7, 8]
  },
  {
    "id": 3,
    "name": "Iron Basin",
    "owner": "player",
    "points": "413,36 654,36 661,218 430,201",
    "centerX": 539,
    "centerY": 123,
    "borders": [2, 4, 7, 8, 9]
  },
  {
    "id": 4,
    "name": "Silver Coast",
    "owner": "neutral",
    "points": "654,36 849,36 854,182 661,218",
    "centerX": 754,
    "centerY": 118,
    "borders": [3, 5, 8, 9, 10]
  },
  {
    "id": 5,
    "name": "Sun Gate",
    "owner": "enemy",
    "points": "849,36 1064,36 1064,201 854,182",
    "centerX": 958,
    "centerY": 114,
    "borders": [4, 9, 10]
  },
  {
    "id": 6,
    "name": "East March",
    "owner": "player",
    "points": "36,201 254,224 217,430 36,409",
    "centerX": 136,
    "centerY": 316,
    "borders": [1, 2, 7, 11, 12]
  },
  {
    "id": 7,
    "name": "Oak Frontier",
    "owner": "player",
    "points": "254,224 430,201 434,427 217,430",
    "centerX": 334,
    "centerY": 321,
    "borders": [1, 2, 3, 6, 8, 11, 12, 13]
  },
  {
    "id": 8,
    "name": "River Crown",
    "owner": "enemy",
    "points": "430,201 661,218 656,395 434,427",
    "centerX": 545,
    "centerY": 310,
    "borders": [2, 3, 4, 7, 9, 12, 13, 14]
  },
  {
    "id": 9,
    "name": "Amber Plains",
    "owner": "neutral",
    "points": "661,218 854,182 852,398 656,395",
    "centerX": 756,
    "centerY": 298,
    "borders": [3, 4, 5, 8, 10, 13, 14, 15]
  },
  {
    "id": 10,
    "name": "Gray Valley",
    "owner": "neutral",
    "points": "854,182 1064,201 1064,409 852,398",
    "centerX": 958,
    "centerY": 298,
    "borders": [4, 5, 9, 14, 15]
  },
  {
    "id": 11,
    "name": "Deep Hollow",
    "owner": "enemy",
    "points": "36,409 217,430 235,584 36,584",
    "centerX": 131,
    "centerY": 502,
    "borders": [6, 7, 12]
  },
  {
    "id": 12,
    "name": "Fort Banner",
    "owner": "ally",
    "points": "217,430 434,427 413,584 235,584",
    "centerX": 325,
    "centerY": 506,
    "borders": [6, 7, 8, 11, 13]
  },
  {
    "id": 13,
    "name": "Storm Delta",
    "owner": "enemy",
    "points": "434,427 656,395 654,584 413,584",
    "centerX": 539,
    "centerY": 498,
    "borders": [7, 8, 9, 12, 14]
  },
  {
    "id": 14,
    "name": "Red Expanse",
    "owner": "enemy",
    "points": "656,395 852,398 849,584 654,584",
    "centerX": 753,
    "centerY": 490,
    "borders": [8, 9, 10, 13, 15]
  },
  {
    "id": 15,
    "name": "South Bay",
    "owner": "enemy",
    "points": "852,398 1064,409 1064,584 849,584",
    "centerX": 957,
    "centerY": 494,
    "borders": [9, 10, 14]
  }
]
}

export const provinces: Province[] = gameMapData.provinces.map((province) => ({
  ...province,
  color: province.color ?? ownerColorMap[province.owner] ?? ownerColorMap.neutral,
}))
