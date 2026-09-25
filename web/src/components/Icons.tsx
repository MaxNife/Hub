import type { ReactNode, SVGProps } from 'react';

// One line-icon set for the shell (24px grid, 2px stroke, currentColor).
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
export const IconStar = (p: P) => <Svg {...p}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z" /></Svg>;
export const IconStarFilled = (p: P) => <Svg {...p} fill="currentColor"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconGrid = (p: P) => <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></Svg>;
export const IconSettings = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h10" /></Svg>;
export const IconPopOut = (p: P) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></Svg>;
export const IconMoon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>;
export const IconMonitor = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4" /></Svg>;
export const IconShuffle = (p: P) => <Svg {...p}><path d="M3 7h3.5c2 0 3.3 1 4.5 3l2 4c1.2 2 2.5 3 4.5 3H21M18 14l3 3-3 3M3 17h3.5c1.6 0 2.7-.6 3.7-1.8M13.8 8.8C14.8 7.6 15.9 7 17.5 7H21M18 4l3 3-3 3" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p} fill="currentColor" stroke="none"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconEyeOff = (p: P) => <Svg {...p}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>;
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconCloud = (p: P) => <Svg {...p}><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-.5 9.5z" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>;

export const IconSliders = (p: P) => <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>;
export const IconChevronLeft = (p: P) => <Svg strokeWidth="2" {...p}><path d="m15 5-7 7 7 7" /></Svg>;
export const IconChevronRight = (p: P) => <Svg strokeWidth="2" {...p}><path d="m9 5 7 7-7 7" /></Svg>;
export const IconChevronUp = (p: P) => <Svg strokeWidth="2" {...p}><path d="m5 15 7-7 7 7" /></Svg>;
export const IconChevronDown = (p: P) => <Svg strokeWidth="2" {...p}><path d="m5 9 7 7 7-7" /></Svg>;
export const IconClose = (p: P) => <Svg strokeWidth="2.2" {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="0" y="0" width="11.5" height="11.5" rx="3.5" fill="#7C5CFF" />
      <rect x="14.5" y="0" width="11.5" height="11.5" rx="3.5" fill="#FF9F3F" />
      <rect x="0" y="14.5" width="11.5" height="11.5" rx="3.5" fill="#2EBE7A" />
      <rect x="14.5" y="14.5" width="11.5" height="11.5" rx="3.5" fill="#FF5C7A" />
    </svg>
  );
}

// Club crest: a shield in the club colour, optionally with its code.
export function Shield({ color, code, width = 34 }: { color: string; code?: string; width?: number }) {
  return (
    <svg width={width} height={width * 46 / 40} viewBox="0 0 40 46" aria-hidden="true" className="shield">
      <path d="M4 4h32v16c0 12-8 20-16 23C12 40 4 32 4 20z" fill={color} />
      {code && <text x="20" y="25" textAnchor="middle" fontWeight="700" fontSize="11" fill="#FFFFFF">{code}</text>}
    </svg>
  );
}
