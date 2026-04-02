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

/** Format price Hyperliquid-style: 5 significant digits total.
 *  65,555 | 1,122.3 | 103.24 | 1.0324 | 0.12345 */
export const fmt = (n: number): string => {
  const abs = Math.abs(n);
  let decimals: number;
  if (abs >= 10000)     decimals = 0;
  else if (abs >= 1000) decimals = 1;
  else if (abs >= 100)  decimals = 2;
  else if (abs >= 10)   decimals = 3;
  else if (abs >= 1)    decimals = 4;
  else                  decimals = 5;
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export const fmtK = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n}`;
