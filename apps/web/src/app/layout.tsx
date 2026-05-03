// apps/web/src/app/layout.tsx
//
// Plan 07-02 + Phase M-4-INFRA — Root shell.
//
// Server Component (no 'use client'). Imports the locked global.css
// once per CONTEXT D-07; loads the design fonts via next/font/google
// (Instrument Serif, Inter, JetBrains Mono, Fraunces) so the
// prototype's PP/Berkeley fall-through chain still resolves; wraps
// children in:
//
//     LogtoSessionProvider  (Server Component → context)
//       QueryProvider       (TanStack Query)
//         I18nProvider      (M-4-INFRA: wraps locked window.I18nProvider)
//           NavShim         (M-4-INFRA: window.app.navigate + safe
//                            window.mcpToast / window.mcpDrawer
//                            console fallbacks)
//             ApplyTokens   (CSS-vars from window.MCPTokens)
//             {children}
//
// The layout itself uses ONLY locked primitives (no new visual
// additions per CLAUDE.md §12 rule 15 + CONTEXT D-01/D-07).
//
// Sentry: client/server/edge configs live at apps/web/sentry.*.config.ts
// and are picked up by @sentry/nextjs's next.config.ts withSentryConfig.
// No SentryProvider is needed in the React tree.

import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import '@/global.css';

import TweaksPanelClientShell from '@/components/tweaks-panel-client-shell';
import { evaluateBooleanFlag } from '@/lib/flags';
import I18nProvider from '@/providers/i18n-provider';
import { LogtoSessionProvider } from '@/providers/logto-session';
import NavShim from '@/providers/nav-shim';
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

export default async function RootLayout({ children }: Props): Promise<ReactElement> {
  const fontVariables = [
    inter.variable,
    instrumentSerif.variable,
    jetbrainsMono.variable,
    fraunces.variable,
  ].join(' ');

  // REQ-002 — gate the dev-tooling panel behind ui_tweaks_panel_perm.
  // Default false → render NO node at all (no invisible placeholder).
  const tweaksEnabled = await evaluateBooleanFlag(
    'ui_tweaks_panel_perm',
    'anonymous',
    {},
    false,
  );

  return (
    <html lang="en" className={fontVariables}>
      <body>
        <LogtoSessionProvider>
          <QueryProvider>
            <I18nProvider>
              <NavShim>
                <ApplyTokens />
                {children}
                {tweaksEnabled ? <TweaksPanelClientShell /> : null}
              </NavShim>
            </I18nProvider>
          </QueryProvider>
        </LogtoSessionProvider>
      </body>
    </html>
  );
}
