export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// スマホはGPUが弱く、画素密度だけ高い。そのまま描くと極端に重くなる
export const QUALITY = IS_TOUCH
  ? { pixelRatio: 1.5, antialias: false, shadowMap: 1024, softShadow: false }
  : { pixelRatio: 2, antialias: true, shadowMap: 2048, softShadow: true };
