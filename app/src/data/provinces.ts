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
    "owner": "enemy",
    "points": "505,584 320,584 379,461 385,455 400,453 438,463 464,488",
    "centerX": 410,
    "centerY": 566,
    "borders": [
      20,
      24,
      27,
      40
    ]
  },
  {
    "id": 2,
    "name": "High Ridge",
    "owner": "neutral",
    "points": "1064,36 1064,132 1011,164 931,172 884,150 862,36",
    "centerX": 900,
    "centerY": 68,
    "borders": [
      13,
      41
    ]
  },
  {
    "id": 3,
    "name": "Iron Basin",
    "owner": "ally",
    "points": "602,36 643,36 668,132 628,278 565,283 551,275 557,116",
    "centerX": 579,
    "centerY": 158,
    "borders": [
      6,
      8,
      21,
      27,
      37
    ]
  },
  {
    "id": 4,
    "name": "Silver Coast",
    "owner": "enemy",
    "points": "36,364 36,301 126,229 139,230 199,258 199,366 177,388",
    "centerX": 134,
    "centerY": 290,
    "borders": [
      17,
      18,
      22,
      24,
      28,
      34
    ]
  },
  {
    "id": 5,
    "name": "Sun Gate",
    "owner": "player",
    "points": "671,474 692,321 734,315 857,429 858,432 698,505",
    "centerX": 763,
    "centerY": 427,
    "borders": [
      10,
      16,
      21,
      29,
      32,
      35
    ]
  },
  {
    "id": 6,
    "name": "East March",
    "owner": "player",
    "points": "557,116 551,275 440,239 440,239 430,191",
    "centerX": 532,
    "centerY": 156,
    "borders": [
      3,
      27
    ]
  },
  {
    "id": 7,
    "name": "Oak Frontier",
    "owner": "neutral",
    "points": "982,292 1005,355 988,367 945,364 909,321",
    "centerX": 946,
    "centerY": 343,
    "borders": [
      26,
      29,
      41
    ]
  },
  {
    "id": 8,
    "name": "River Crown",
    "owner": "player",
    "points": "454,79 486,36 602,36 557,116 430,191 429,190",
    "centerX": 510,
    "centerY": 118,
    "borders": [
      3,
      43
    ]
  },
  {
    "id": 9,
    "name": "Amber Plains",
    "owner": "ally",
    "points": "987,480 974,397 988,367 1005,355 1064,377 1064,420",
    "centerX": 1001,
    "centerY": 415,
    "borders": [
      31,
      33,
      41
    ]
  },
  {
    "id": 10,
    "name": "Gray Valley",
    "owner": "player",
    "points": "734,315 771,284 858,271 895,322 857,429",
    "centerX": 848,
    "centerY": 335,
    "borders": [
      5,
      13,
      21,
      26,
      29
    ]
  },
  {
    "id": 11,
    "name": "Deep Hollow",
    "owner": "enemy",
    "points": "379,461 320,584 261,584 236,470",
    "centerX": 278,
    "centerY": 503,
    "borders": [
      23,
      24
    ]
  },
  {
    "id": 12,
    "name": "Fort Banner",
    "owner": "ally",
    "points": "36,567 36,482 80,517 79,520",
    "centerX": 36,
    "centerY": 553,
    "borders": [
      18
    ]
  },
  {
    "id": 13,
    "name": "Storm Delta",
    "owner": "enemy",
    "points": "817,145 884,150 931,172 858,271 771,284 787,167",
    "centerX": 830,
    "centerY": 213,
    "borders": [
      2,
      10,
      15,
      21,
      26,
      37
    ]
  },
  {
    "id": 14,
    "name": "Red Expanse",
    "owner": "player",
    "points": "163,584 62,584 79,520 80,517 140,531",
    "centerX": 81,
    "centerY": 574,
    "borders": [
      23,
      39
    ]
  },
  {
    "id": 15,
    "name": "South Bay",
    "owner": "ally",
    "points": "884,150 817,145 777,36 862,36",
    "centerX": 839,
    "centerY": 80,
    "borders": [
      13,
      37
    ]
  },
  {
    "id": 16,
    "name": "West Crest",
    "owner": "enemy",
    "points": "637,477 671,474 698,505 718,584 527,584",
    "centerX": 610,
    "centerY": 555,
    "borders": [
      5,
      32,
      35,
      42
    ]
  },
  {
    "id": 17,
    "name": "Moon Harbor",
    "owner": "ally",
    "points": "198,106 229,234 199,258 139,230 198,107",
    "centerX": 182,
    "centerY": 188,
    "borders": [
      4,
      28,
      34
    ]
  },
  {
    "id": 18,
    "name": "Gold Ridge",
    "owner": "player",
    "points": "36,482 36,364 177,388 186,434 140,531 80,517",
    "centerX": 105,
    "centerY": 466,
    "borders": [
      4,
      12,
      24
    ]
  },
  {
    "id": 19,
    "name": "Cinder Fields",
    "owner": "enemy",
    "points": "212,36 353,36 354,54 314,123 218,82",
    "centerX": 306,
    "centerY": 44,
    "borders": [
      25,
      30,
      43
    ]
  },
  {
    "id": 20,
    "name": "Azure Pass",
    "owner": "ally",
    "points": "539,359 587,458 464,488 438,463",
    "centerX": 540,
    "centerY": 432,
    "borders": [
      1,
      27,
      32,
      42
    ]
  },
  {
    "id": 21,
    "name": "Province 21",
    "owner": "player",
    "points": "668,132 787,167 771,284 734,315 692,321 628,278",
    "centerX": 732,
    "centerY": 200,
    "borders": [
      3,
      5,
      10,
      13,
      37
    ]
  },
  {
    "id": 22,
    "name": "Province 22",
    "owner": "player",
    "points": "79,130 126,229 36,301 36,113",
    "centerX": 68,
    "centerY": 207,
    "borders": [
      4,
      34
    ]
  },
  {
    "id": 23,
    "name": "Province 23",
    "owner": "ally",
    "points": "236,470 261,584 163,584 140,531 186,434",
    "centerX": 212,
    "centerY": 517,
    "borders": [
      11,
      14,
      24
    ]
  },
  {
    "id": 24,
    "name": "Province 24",
    "owner": "player",
    "points": "385,455 379,461 236,470 186,434 177,388 199,366 297,359",
    "centerX": 273,
    "centerY": 433,
    "borders": [
      1,
      4,
      11,
      18,
      23,
      28,
      40
    ]
  },
  {
    "id": 25,
    "name": "Province 25",
    "owner": "enemy",
    "points": "212,36 218,82 198,106 198,107 79,130 36,113 36,36",
    "centerX": 124,
    "centerY": 68,
    "borders": [
      19,
      30,
      34
    ]
  },
  {
    "id": 26,
    "name": "Province 26",
    "owner": "neutral",
    "points": "931,172 1011,164 982,292 909,321 895,322 858,271",
    "centerX": 921,
    "centerY": 280,
    "borders": [
      7,
      10,
      13,
      29
    ]
  },
  {
    "id": 27,
    "name": "Province 27",
    "owner": "enemy",
    "points": "400,453 440,239 551,275 565,283 539,359 438,463",
    "centerX": 466,
    "centerY": 360,
    "borders": [
      1,
      3,
      6,
      20,
      32,
      40
    ]
  },
  {
    "id": 28,
    "name": "Province 28",
    "owner": "enemy",
    "points": "229,234 240,232 314,324 297,359 199,366 199,258",
    "centerX": 264,
    "centerY": 290,
    "borders": [
      4,
      17,
      24,
      30,
      36,
      40
    ]
  },
  {
    "id": 29,
    "name": "Province 29",
    "owner": "ally",
    "points": "858,432 857,429 895,322 909,321 945,364 872,426 859,432",
    "centerX": 923,
    "centerY": 362,
    "borders": [
      5,
      7,
      10,
      26,
      33
    ]
  },
  {
    "id": 30,
    "name": "Province 30",
    "owner": "player",
    "points": "240,232 229,234 198,106 218,82 314,123 314,124 272,219",
    "centerX": 250,
    "centerY": 171,
    "borders": [
      19,
      25,
      28,
      36,
      44
    ]
  },
  {
    "id": 31,
    "name": "Province 31",
    "owner": "player",
    "points": "987,480 933,569 859,432 872,426 974,397",
    "centerX": 953,
    "centerY": 422,
    "borders": [
      9
    ]
  },
  {
    "id": 32,
    "name": "Province 32",
    "owner": "ally",
    "points": "637,477 587,458 539,359 565,283 628,278 692,321 671,474",
    "centerX": 596,
    "centerY": 404,
    "borders": [
      5,
      16,
      20,
      27,
      42
    ]
  },
  {
    "id": 33,
    "name": "Province 33",
    "owner": "ally",
    "points": "945,364 988,367 974,397 872,426",
    "centerX": 943,
    "centerY": 386,
    "borders": [
      9,
      29
    ]
  },
  {
    "id": 34,
    "name": "Province 34",
    "owner": "ally",
    "points": "79,130 198,107 139,230 126,229",
    "centerX": 145,
    "centerY": 171,
    "borders": [
      4,
      17,
      22,
      25
    ]
  },
  {
    "id": 35,
    "name": "Province 35",
    "owner": "enemy",
    "points": "858,432 859,432 933,569 934,584 718,584 698,505",
    "centerX": 799,
    "centerY": 507,
    "borders": [
      5,
      16,
      45
    ]
  },
  {
    "id": 36,
    "name": "Province 36",
    "owner": "neutral",
    "points": "314,324 240,232 272,219 368,265",
    "centerX": 291,
    "centerY": 267,
    "borders": [
      28,
      30,
      40
    ]
  },
  {
    "id": 37,
    "name": "Province 37",
    "owner": "ally",
    "points": "643,36 777,36 817,145 787,167 668,132",
    "centerX": 758,
    "centerY": 110,
    "borders": [
      3,
      13,
      15,
      21
    ]
  },
  {
    "id": 38,
    "name": "Province 38",
    "owner": "neutral",
    "points": "486,36 454,79 354,54 353,36",
    "centerX": 400,
    "centerY": 36,
    "borders": []
  },
  {
    "id": 39,
    "name": "Province 39",
    "owner": "player",
    "points": "36,584 36,567 79,520 62,584",
    "centerX": 50,
    "centerY": 566,
    "borders": [
      14
    ]
  },
  {
    "id": 40,
    "name": "Province 40",
    "owner": "ally",
    "points": "440,239 400,453 385,455 297,359 314,324 368,265 440,239",
    "centerX": 373,
    "centerY": 342,
    "borders": [
      1,
      24,
      27,
      28,
      36
    ]
  },
  {
    "id": 41,
    "name": "Province 41",
    "owner": "player",
    "points": "1064,132 1064,377 1005,355 982,292 1011,164",
    "centerX": 1043,
    "centerY": 307,
    "borders": [
      2,
      7,
      9
    ]
  },
  {
    "id": 42,
    "name": "Province 42",
    "owner": "enemy",
    "points": "505,584 464,488 587,458 637,477 527,584",
    "centerX": 558,
    "centerY": 502,
    "borders": [
      16,
      20,
      32
    ]
  },
  {
    "id": 43,
    "name": "Province 43",
    "owner": "player",
    "points": "314,123 354,54 454,79 429,190 314,124",
    "centerX": 386,
    "centerY": 91,
    "borders": [
      8,
      19,
      44
    ]
  },
  {
    "id": 44,
    "name": "Province 44",
    "owner": "enemy",
    "points": "314,124 429,190 430,191 440,239 368,265 272,219",
    "centerX": 322,
    "centerY": 203,
    "borders": [
      30,
      43
    ]
  },
  {
    "id": 45,
    "name": "Province 45",
    "owner": "ally",
    "points": "934,584 933,569 987,480 1064,420 1064,584",
    "centerX": 1053,
    "centerY": 483,
    "borders": [
      35
    ]
  }
]
}

export const provinces: Province[] = gameMapData.provinces.map((province) => ({
  ...province,
  color: province.color ?? ownerColorMap[province.owner],
}))
