import type { ProductStatus } from '@/types/models';

// Design system Junto — mesmos valores do canvas de design.

export const palette = {
  light: {
    bg: '#F6F5F1',
    surface: '#FFFFFF',
    surfaceAlt: '#F1EFEA',
    sunken: '#ECEAE4',
    text: '#16181D',
    textMuted: '#5B6070',
    textSubtle: '#3F4451',
    line: '#E7E5DF',
    lineStrong: '#D9D6CE',
    primary: '#17643F',
    primaryPressed: '#0F4A2E',
    primarySoft: '#D6EDE0',
    onPrimary: '#FFFFFF',
    accent: '#F28C45',
    onAccent: '#1A0E05',
    accentSoft: '#FDE7D3',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
    warningSoft: '#FEF3E2',
    onWarningSoft: '#7A2E0B',
    inverse: '#16181D',
    onInverse: '#FFFFFF',
    overlay: 'rgba(22,24,29,0.45)',
    focus: '#D6EDE0',
    progressTrack: '#EEECE6',
  },
  dark: {
    bg: '#0F1113',
    surface: '#181B1F',
    surfaceAlt: '#1C2025',
    sunken: '#23272D',
    text: '#F2F3F5',
    textMuted: '#9BA1AE',
    textSubtle: '#C9CDD4',
    line: '#262A30',
    lineStrong: '#3A4048',
    primary: '#4ADE8F',
    primaryPressed: '#86EFB5',
    primarySoft: '#173D29',
    onPrimary: '#06210F',
    accent: '#F28C45',
    onAccent: '#1A0E05',
    accentSoft: '#3D2412',
    danger: '#F87171',
    dangerSoft: '#3A1715',
    warningSoft: '#3A2410',
    onWarningSoft: '#FCD9BD',
    inverse: '#F2F3F5',
    onInverse: '#0F1113',
    overlay: 'rgba(0,0,0,0.6)',
    focus: '#173D29',
    progressTrack: '#262A30',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)['light']]: string };

export const statusColors: Record<ColorScheme, Record<ProductStatus, { bg: string; fg: string }>> = {
  light: {
    pending: { bg: '#EEECE6', fg: '#3F4451' },
    in_review: { bg: '#DCE8FB', fg: '#1E3A8A' },
    awaiting_confirmation: { bg: '#FDE7D3', fg: '#8A2C0A' },
    approved: { bg: '#D6EDE0', fg: '#0F4A2E' },
    rejected: { bg: '#FBE1DE', fg: '#8F1A10' },
    purchased: { bg: '#17643F', fg: '#FFFFFF' },
    unavailable: { bg: '#E4E6EA', fg: '#3F4451' },
    cancelled: { bg: '#F1EFEA', fg: '#5B6070' },
  },
  dark: {
    pending: { bg: '#23272D', fg: '#C9CDD4' },
    in_review: { bg: '#172A4A', fg: '#BFD3F8' },
    awaiting_confirmation: { bg: '#3D2412', fg: '#FCD9BD' },
    approved: { bg: '#173D29', fg: '#A7F0C6' },
    rejected: { bg: '#3A1715', fg: '#FBB4AD' },
    purchased: { bg: '#4ADE8F', fg: '#06210F' },
    unavailable: { bg: '#2A2E35', fg: '#C9CDD4' },
    cancelled: { bg: '#1C2025', fg: '#9BA1AE' },
  },
};

export const avatarColors = [
  { bg: '#17643F', fg: '#FFFFFF' },
  { bg: '#FCD9BD', fg: '#7C2D12' },
  { bg: '#DCE8FB', fg: '#1E3A8A' },
  { bg: '#EADCF8', fg: '#5B21B6' },
  { bg: '#FDE68A', fg: '#713F12' },
  { bg: '#CCFBF1', fg: '#115E59' },
];

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 16, xl: 20, xxl: 24, pill: 999 } as const;

export const font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: font.extrabold, fontSize: 34, letterSpacing: -0.8, lineHeight: 40 },
  title: { fontFamily: font.extrabold, fontSize: 24, letterSpacing: -0.4, lineHeight: 30 },
  heading: { fontFamily: font.extrabold, fontSize: 20, letterSpacing: -0.3, lineHeight: 26 },
  subheading: { fontFamily: font.extrabold, fontSize: 17, lineHeight: 22 },
  bodyStrong: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: font.extrabold, fontSize: 11, lineHeight: 14 },
  overline: { fontFamily: font.extrabold, fontSize: 12, letterSpacing: 0.8, lineHeight: 16, textTransform: 'uppercase' as const },
} as const;

export const MIN_TOUCH = 44;
