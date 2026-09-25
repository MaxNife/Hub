import type { AppIconKind } from '../data';

// Multi-color SVG icons per app (design tokens live here, not in per-app files yet).
export function AppIcon({ kind, size = 76 }: { kind: AppIconKind; size?: number }) {
  const s = { width: size, height: size } as const;
  switch (kind) {
    case 'football':
      return (
        <svg viewBox="0 0 64 64" {...s}><defs><linearGradient id="gFb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#36C572" /><stop offset="1" stopColor="#0E6B39" /></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#gFb)" /><circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="4" /><path d="M32 25.5l6.2 4.5-2.4 7.3h-7.6L25.8 30z" fill="#fff" /><path d="M32 25.5V18M38.2 30l7.2-2.3M35.8 37.3l4.4 6M28.2 37.3l-4.4 6M25.8 30l-7.2-2.3" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
      );
    case 'memory':
      return (
        <svg viewBox="0 0 64 64" {...s}><defs><linearGradient id="gMem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#A07FFF" /><stop offset="1" stopColor="#5A32E0" /></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#gMem)" /><rect x="15" y="20" width="19" height="27" rx="4" fill="#fff" fillOpacity="0.5" transform="rotate(-12 24.5 33.5)" /><rect x="28" y="16" width="19" height="27" rx="4" fill="#fff" transform="rotate(8 37.5 29.5)" /></svg>
      );
    case 'meal':
      return (
        <svg viewBox="0 0 64 64" {...s}><defs><linearGradient id="gMeal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB443" /><stop offset="1" stopColor="#FF5E1F" /></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#gMeal)" /><path d="M22 16v10a5 5 0 0 0 10 0V16M27 16v32M43 48V16c-4 2-6 8-6 15h6" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      );
    case 'converter':
      return (
        <svg viewBox="0 0 64 64" {...s}><defs><linearGradient id="gConv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5A8DFF" /><stop offset="1" stopColor="#2146C9" /></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#gConv)" /><path d="M18 25h26m-7-7 7 7-7 7M46 39H20m7-7-7 7 7 7" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      );
    case 'transcribe':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gTr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16345C" /><stop offset="1" stopColor="#0A1A30" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gTr)" /><rect x="27" y="11" width="18" height="30" rx="9" fill="#fff" /><path d="M21 33a15 15 0 0 0 30 0M36 48v10" fill="none" stroke="#6FDBFF" strokeWidth="3.5" strokeLinecap="round" /></svg>
      );
    case 'reaction':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gRx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE066" /><stop offset="1" stopColor="#FF9A1F" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gRx)" /><circle cx="34" cy="39" r="16" fill="#F0336A" /><circle cx="34" cy="39" r="10" fill="#fff" /><circle cx="34" cy="39" r="4.5" fill="#F0336A" /></svg>
      );
    case 'puzzle':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gPz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#43DDB9" /><stop offset="1" stopColor="#0E8A74" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gPz)" /><rect x="13" y="13" width="21" height="21" rx="5" fill="#fff" /><rect x="38" y="13" width="21" height="21" rx="5" fill="#FFD34D" /><rect x="13" y="38" width="21" height="21" rx="5" fill="#FF5C8A" /><rect x="38" y="38" width="21" height="21" rx="5" fill="#15395E" /></svg>
      );
    case 'random':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gRnd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8A7DFF" /><stop offset="1" stopColor="#2F3FD0" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gRnd)" /><rect x="15" y="15" width="42" height="42" rx="10" fill="#fff" /><circle cx="36" cy="36" r="4.5" fill="#2FAE5B" /><circle cx="26" cy="26" r="4.5" fill="#FF5C8A" /><circle cx="46" cy="46" r="4.5" fill="#6C4DF5" /></svg>
      );
    case 'names':
      return (
        <svg viewBox="0 0 72 72" {...s}><rect width="72" height="72" rx="18" fill="#1F2A44" /><text x="36" y="45" textAnchor="middle" fontFamily="'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif" fontWeight="700" fontSize="28" fill="#FFD34D">Aa</text></svg>
      );
  }
}
