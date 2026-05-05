// apps/web/src/app/icon.tsx
//
// BUG-014 fix — `/favicon.ico` was a hard 404 on every page load.
// Next.js auto-generates a 32×32 PNG icon at build/request time from this
// file (see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons).
//
// The mark uses the canon brand glyph `◤` which already appears in the
// landing topbar + footer (see apps/web/src/components/screens/landing/landing.tsx:617-642).
// Black-on-paper matches the canon's monochrome ink/paper palette.

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF8F4',
          color: '#0E0E0E',
          fontSize: 26,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1,
        }}
      >
        ◤
      </div>
    ),
    size,
  );
}
