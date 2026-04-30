// apps/web/src/app/layout.tsx
//
// Plan 07-02 — Root shell. Server Component (no 'use client'). Imports the
// locked global.css ONCE per CONTEXT D-07; loads the design fonts via
// next/font/google (Instrument Serif, Inter, JetBrains Mono, Fraunces) so
// the prototype's PP/Berkeley fall-through chain still resolves; wraps
// children in LogtoSessionProvider → QueryProvider; mounts a Client island
// that calls applyTokens() once to populate CSS vars on <html>.
//
// The layout itself uses ONLY locked primitives (no new visual additions
// per CLAUDE.md §12 rule 15 + CONTEXT D-01/D-07).

import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import '@/global.css';

import { LogtoSessionProvider } from '@/providers/logto-session';
import QueryProvider from '@/providers/query-client';

import ApplyTokens from './_apply-tokens';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MCPGen',
  description: 'From any API to production-ready MCP in 60 seconds.',
};

interface Props {
  children: ReactNode;
}

export default function RootLayout({ children }: Props): ReactElement {
  const fontVariables = [
    inter.variable,
    instrumentSerif.variable,
    jetbrainsMono.variable,
    fraunces.variable,
  ].join(' ');
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <LogtoSessionProvider>
          <QueryProvider>
            <ApplyTokens />
            {children}
          </QueryProvider>
        </LogtoSessionProvider>
      </body>
    </html>
  );
}
