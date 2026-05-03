// apps/web/src/app/settings/settings-client.tsx
//
// Phase 2 — Settings client wrapper. Splits navigation handlers + the
// post-mount BFF refinement (profile + sessions) from the page-level
// Server Component. The route page resolves Logto + flags server-side;
// this wrapper:
//
//   1. Wires next/navigation onBack / onDashboard / onMarketplace / onBilling.
//   2. On mount calls useAccountProfile() — when the BFF responds we
//      replace the safe blanks (handle = '', tz = 'Europe/London', etc.)
//      with real Logto-backed values.
//   3. On mount calls useAccountSessions() — when `available: false` we
//      render the canon "session listing coming soon" empty state. When
//      `available: true` we pass the real session list through.
//
// Mirrors the dashboard-list / billing pattern.

'use client';

import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import {
  useAccountProfile,
  useAccountSessions,
} from '@/lib/api/account';
import Settings, {
  type SettingsProps,
} from '@/components/screens/settings/settings';
import type { SessionEntry } from '@/components/screens/settings/sections/security';

interface ClientProps {
  readonly initialProps: Omit<
    SettingsProps,
    'onBack' | 'onDashboard' | 'onMarketplace' | 'onBilling'
  >;
}

export default function SettingsClient({
  initialProps,
}: ClientProps): JSX.Element {
  const router = useRouter();
  const profileQuery = useAccountProfile();
  const sessionsQuery = useAccountSessions();

  // Refine profile data once the BFF responds. Until then we hold the safe
  // blanks the SSR page produced — guaranteed not to contain canon mock
  // literals (per brief §Hard requirements).
  const profileResult = profileQuery.data;
  const profileRefined = ((): typeof initialProps.profile => {
    if (profileResult === undefined || !profileResult.ok) {
      return initialProps.profile;
    }
    const p = profileResult.data;
    return {
      handle: p.handle === '' ? initialProps.profile.handle : p.handle,
      timezone:
        p.timezone === '' ? initialProps.profile.timezone : p.timezone,
      language:
        p.language === '' ? initialProps.profile.language : p.language,
      bio: p.bio,
    };
  })();

  // Pull a refined display name / email from the profile when present.
  const userName = ((): string => {
    if (profileResult === undefined || !profileResult.ok) {
      return initialProps.userName;
    }
    return profileResult.data.name === ''
      ? initialProps.userName
      : profileResult.data.name;
  })();

  const userEmail = ((): string => {
    if (profileResult === undefined || !profileResult.ok) {
      return initialProps.userEmail;
    }
    return profileResult.data.email === ''
      ? initialProps.userEmail
      : profileResult.data.email;
  })();

  // Sessions — when `available: false` (canonical Logto Cloud response today)
  // we pass through `sessionsUnavailable=true` and an empty list, which the
  // security section renders as the "coming soon" empty state. When
  // `available: true` we map the wire shape into SessionEntry rows.
  const sessionsResult = sessionsQuery.data;
  const { sessions, sessionsUnavailable } = ((): {
    sessions: ReadonlyArray<SessionEntry>;
    sessionsUnavailable: boolean;
  } => {
    if (sessionsResult === undefined || !sessionsResult.ok) {
      return {
        sessions: initialProps.sessions,
        sessionsUnavailable: initialProps.sessionsUnavailable,
      };
    }
    if (!sessionsResult.data.available) {
      return { sessions: [], sessionsUnavailable: true };
    }
    return {
      sessions: sessionsResult.data.sessions.map<SessionEntry>((s) => ({
        id: s.id,
        isCurrent: s.current,
        device: s.device,
        ip: s.ip,
        location: s.location,
        when: s.last_active,
        // Canon used a single-glyph osIcon; real Logto data doesn't carry
        // one, so we collapse to a neutral pill until OS-detection ships.
        osGlyph: '◇',
      })),
      sessionsUnavailable: false,
    };
  })();

  return (
    <Settings
      {...initialProps}
      userName={userName}
      userEmail={userEmail}
      profile={profileRefined}
      sessions={sessions}
      sessionsUnavailable={sessionsUnavailable}
      onBack={(): void => router.push('/dashboard')}
      onDashboard={(): void => router.push('/dashboard')}
      onMarketplace={(): void => router.push('/marketplace')}
      onBilling={(): void => router.push('/billing')}
    />
  );
}
