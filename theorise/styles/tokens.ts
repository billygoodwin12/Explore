/** Design tokens extracted from Theorise design system */

export const colors = {
  bg: '#faf9f7',
  bgCard: '#ffffff',
  bgSurface: '#f7f6f3',
  bgElevated: '#ffffff',

  textPrimary: '#1a1917',
  textSecondary: '#5c5955',
  textTertiary: '#8a8680',
  textMuted: '#a8a49e',
  textInverse: '#ffffff',

  border: '#eeedea',
  borderStrong: '#e2e0db',
  borderFocus: '#7c3aed',

  green: '#22c55e',
  greenDark: '#059669',
  red: '#dc2626',
  purple: '#7c3aed',
  amber: '#f59e0b',
} as const;

export const fonts = {
  display: "'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;
