import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

// Ícones de traço (2 px) desenhados para o Junto — mesmos do design system.
const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20h14V9.5'],
  cart: ['M2.5 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H6.2', { c: [9, 20, 1.5] }, { c: [18, 20, 1.5] }],
  bell: ['M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8', 'M10.3 20a1.9 1.9 0 0 0 3.4 0'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z'],
  user: ['M4 21a8 8 0 0 1 16 0', { c: [12, 8, 4] }],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 6l6 6-6 6'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  tag: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z', { c: [7.5, 7.5, 1.5] }],
  invite: ['M2 21a7 7 0 0 1 14 0', 'M19 8v6M16 11h6', { c: [9, 8, 4] }],
  gear: [
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    { c: [12, 12, 3] },
  ],
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4 20-7Z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'M13.5 6.5l4 4'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
  qr: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z', 'M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4z'],
  camera: ['M3 8h4l2-3h6l2 3h4v12H3z', { c: [12, 13, 4] }],
  image: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'M21 15l-5-5-11 9', { c: [8.5, 9.5, 1.5] }],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  share: ['M4 12v8h16v-8', 'M12 3v13', 'M7 8l5-5 5 5'],
  logout: ['M15 4h4v16h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  question: ['M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14', 'M12 17.5h.01', { c: [12, 12, 9] }],
  wifiOff: ['M2 2l20 20', 'M8.5 16.5a5 5 0 0 1 7 0', 'M5 12.5a10 10 0 0 1 5-2.7', 'M19 12.5a10 10 0 0 0-2.1-1.5', 'M2 8.8a15 15 0 0 1 4.2-2.6', 'M22 8.8A15 15 0 0 0 11 5', 'M12 20h.01'],
  sun: ['M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', { c: [12, 12, 4] }],
  dots: [{ c: [5, 12, 1] }, { c: [12, 12, 1] }, { c: [19, 12, 1] }],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const { colors } = useTheme();
  const stroke = color ?? colors.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((part, i) =>
        typeof part === 'string' ? <Path key={i} d={part} /> : <Circle key={i} cx={part.c[0]} cy={part.c[1]} r={part.c[2]} />,
      )}
    </Svg>
  );
}
