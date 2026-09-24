import type { CSSProperties } from 'react';

// Stagger index for entrance animations (read by CSS as --i).
export const stagger = (i: number) => ({ '--i': i }) as CSSProperties;
