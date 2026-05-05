// apps/web/src/app/layout.tsx
//
// Server Component (no 'use client'). Loads the design fonts via
// next/font/google (Instrument Serif, Inter, JetBrains Mono, Fraunces)
// so the canon's PP/Berkeley fall-through chain resolves; mounts the
// production globals.css (with `:root` design tokens) and wraps
// children in:
//
//     NextIntlClientProvider
//       LogtoSessionProvider
//         QueryProvider
//           {children}
//           Toaster + DrawerHost + ErrorModeSwitch
//
// Sentry: client/server/edge configs live at apps/web/sentry.*.config.ts
// and are picked up by @sentry/nextjs's next.config.ts withSentryConfig.
// No SentryProvider is needed in the React tree.

import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import '@/styles/globals.css';

import ErrorModeSwitch from '@/components/dev/error-mode-switch';
import { DrawerHost } from '@/lib/drawer';
import { evaluateBooleanFlag } from '@/lib/flags';
import { Toaster } from '@/lib/toast';
import { LogtoSessionProvider } from '@/providers/logto-session';
import QueryProvider from '@/providers/query-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  // BUG-014 — display headings use `font-style: italic` so we explicitly
  // request both styles. Without this, the browser synthesizes italic by
  // skewing the regular face, which looks worse than the real italic file.
  style: ['normal', 'italic'],
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

  // Phase F-i18n — resolve active locale + messages on the server, then
  // hand them to NextIntlClientProvider so client components can call
  // useTranslations() / useLocale() without each one fetching its own
  // dictionary. Falls back to defaultLocale ('en') when the request has
  // no locale segment (e.g. SSG preview, root `/`).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LogtoSessionProvider>
            <QueryProvider>
              {children}
              <Toaster
                position="bottom-center"
                toastOptions={{
                  style: {
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                    boxShadow: 'var(--shadow)',
                  },
                }}
              />
              <DrawerHost />
              <ErrorModeSwitch enabled={tweaksEnabled} />
            </QueryProvider>
          </LogtoSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
