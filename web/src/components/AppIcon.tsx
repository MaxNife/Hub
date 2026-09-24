import type { AppIconKind } from '../data';

// Multi-color SVG icons per app (design tokens live here, not in per-app files yet).
export function AppIcon({ kind, size = 76 }: { kind: AppIconKind; size?: number }) {
  const s = { width: size, height: size } as const;
  switch (kind) {
    case 'football':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gFb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2DBA5E" /><stop offset="1" stopColor="#0A6630" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gFb)" /><circle cx="36" cy="33" r="18" fill="#fff" /><path d="M36 25l7.6 5.5-2.9 9h-9.4l-2.9-9z" fill="#1A1820" /></svg>
      );
    case 'memory':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gMem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8E6BFF" /><stop offset="1" stopColor="#4326D6" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gMem)" /><rect x="13" y="17" width="26" height="36" rx="5" fill="#FFD34D" /><rect x="32" y="20" width="26" height="36" rx="5" fill="#fff" /><path d="M45 30l6 8-6 8-6-8z" fill="#FF4F7B" /></svg>
      );
    case 'meal':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gMeal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFC45A" /><stop offset="1" stopColor="#FF7A1A" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gMeal)" /><circle cx="36" cy="37" r="21" fill="#fff" /><ellipse cx="32" cy="38" rx="10" ry="7.5" fill="#E8431C" /></svg>
      );
    case 'converter':
      return (
        <svg viewBox="0 0 72 72" {...s}><defs><linearGradient id="gConv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4C86FF" /><stop offset="1" stopColor="#1B3FB0" /></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#gConv)" /><path d="M16 27h36M43 18l9 9-9 9" fill="none" stroke="#FFD34D" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><path d="M56 46H20M29 37l-9 9 9 9" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
