export const TROOP_SIZE_CONFIG = {
  zoomResponse: {
    // exponent > 1 makes units shrink on zoom-in and grow on zoom-out on screen
    exponent: 2,
    minZoomForScaling: 0.25,
    minScaleMultiplier: 0.35,
    maxScaleMultiplier: 4,
  },
  division: {
    radius: 10,
    strokeWidth: 2,
    label: {
      fontSize: 10,
      offsetX: 12,
      offsetY: 4,
    },
  },
  battalion: {
    radius: 6.5,
    strokeWidth: 2.5,
    label: {
      fontSize: 10,
      offsetX: 14,
      offsetY: -12,
    },
  },
} as const
