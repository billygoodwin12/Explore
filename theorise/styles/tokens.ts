/** Design tokens — extracted from Theorise design artifact */

export const C = {
  bg:          '#F0F4F8',
  card:        '#FFFFFF',
  primary:     '#1B2A3D',
  secondary:   '#627D98',
  muted:       '#9FB3C8',
  border:      '#D9E2EC',
  borderLight: '#E4EBF2',
  green:       '#0D9B6B',
  greenBg:     '#E8F5EE',
  greenTxt:    '#087A54',
  red:         '#D14343',
  redBg:       '#FDEAEA',
  redTxt:      '#A32D2D',
  accent:      '#3D5A80',
  accentMid:   '#5B8DB8',
  accentLight: '#8DB5D4',
  hero1:       '#1B2A3D',
  hero2:       '#2C4566',
  hero3:       '#3D5A80',
} as const;

export const D = "'Outfit', sans-serif";
export const M = "'Source Code Pro', monospace";

export const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtK = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n}`;
