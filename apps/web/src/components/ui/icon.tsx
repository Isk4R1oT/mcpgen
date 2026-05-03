// apps/web/src/components/ui/icon.tsx
//
// Phase 0 / F-UIKit — canon `<Icon>` primitive.
//
// Source of truth: claude-design-reference/canon/ui.jsx (`Icon`).
// Custom 1px square-cap stroke icons; NOT lucide. Each `name` resolves to a
// hand-tuned SVG path on a 16×16 grid.
//
// Visual contract:
// - All icons rendered via inline SVG with `stroke="currentColor"` so they
//   inherit text color from parents.
// - `size` controls both width and height (default 14 per canon).
// - The `<svg>` is given `display: inline-block; vertical-align: -2px;` to
//   align mid-baseline against neighbouring text/buttons (canon `Icon` style).
//
// API matches canon exactly: `name`, `size`, `style`. We add `className` for
// Tailwind utility composition (canon never used it because canon styles via
// inline `style`; we keep that channel open).

import type { CSSProperties, JSX } from 'react';

export type IconName =
  | 'arrow-r'
  | 'arrow-l'
  | 'check'
  | 'x'
  | 'plus'
  | 'spark'
  | 'cmd'
  | 'cloud'
  | 'doc'
  | 'box'
  | 'src'
  | 'play'
  | 'share'
  | 'caret-r'
  | 'caret-d'
  | 'bolt'
  | 'dot'
  | 'lock'
  | 'undo'
  | 'copy'
  | 'search'
  | 'warn'
  | 'bell';

export interface IconProps {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 14, style, className }: IconProps): JSX.Element | null {
  // Canon merges width/height onto the svg style + uses display:inline-block
  // and verticalAlign: -2px so icons sit mid-baseline next to text.
  const svgStyle: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    verticalAlign: '-2px',
    ...style,
  };

  // Common attrs shared across the icon set — square-cap, miter-join, 1.25 stroke.
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    style: svgStyle,
    className,
    'data-icon': name,
    'aria-hidden': true,
  };

  switch (name) {
    case 'arrow-r':
      return (
        <svg {...common}>
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      );
    case 'arrow-l':
      return (
        <svg {...common}>
          <path d="M13 8H3M7 4L3 8l4 4" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M3 8.5L6.5 12 13 4.5" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M8 3v10M3 8h10" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M8 2v4M8 10v4M2 8h4M10 8h4M4 4l2.5 2.5M9.5 9.5L12 12M12 4L9.5 6.5M6.5 9.5L4 12" />
        </svg>
      );
    case 'cmd':
      return (
        <svg {...common}>
          <path d="M5 3a2 2 0 100 4h6a2 2 0 100-4M5 13a2 2 0 110-4h6a2 2 0 110 4M5 7v2M11 7v2" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...common}>
          <path d="M4 11.5c-1 0-2-1-2-2.2 0-1.3 1-2.3 2.3-2.3.3-1.6 1.7-2.7 3.3-2.7 1.6 0 3 1.1 3.3 2.7 1.5.1 2.6 1.3 2.6 2.7 0 1.4-1.2 2.6-2.7 2.6H4z" />
        </svg>
      );
    case 'doc':
      return (
        <svg {...common}>
          <path d="M4 2h6l3 3v9H4V2zM10 2v3h3" />
        </svg>
      );
    case 'box':
      return (
        <svg {...common}>
          <path d="M2 5l6-3 6 3v6l-6 3-6-3V5zM2 5l6 3 6-3M8 8v6" />
        </svg>
      );
    case 'src':
      return (
        <svg {...common}>
          <path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 3l-2 10" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M4 3v10l8-5-8-5z" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <path d="M11 5l3-3v3M14 2L8 8M3 5v8h8M3 5h5" />
        </svg>
      );
    case 'caret-r':
      return (
        <svg {...common}>
          <path d="M6 4l4 4-4 4" />
        </svg>
      );
    case 'caret-d':
      return (
        <svg {...common}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
        </svg>
      );
    case 'dot':
      return (
        // Canon override: filled circle, no stroke.
        <svg {...common} strokeWidth={0}>
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <path d="M4 7V5a4 4 0 018 0v2M3 7h10v7H3V7z" />
        </svg>
      );
    case 'undo':
      return (
        <svg {...common}>
          <path d="M3 7h7a3 3 0 010 6H6M3 7l3-3M3 7l3 3" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <path d="M4 4V2h8v8h-2M2 6h8v8H2V6z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4" />
          <path d="M10 10l4 4" />
        </svg>
      );
    case 'warn':
      return (
        <svg {...common}>
          <path d="M8 2L1 14h14L8 2zM8 6v4M8 12v.5" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M4 12V8a4 4 0 018 0v4l1 1H3l1-1zM6 13.5c0 1 1 1.5 2 1.5s2-.5 2-1.5" />
        </svg>
      );
    default:
      return null;
  }
}
