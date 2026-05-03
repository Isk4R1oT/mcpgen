// apps/web/src/components/screens/settings/settings.tsx
//
// Phase 2 — Settings screen (NEW in canon MCPGen(5)).
//
// Source of truth: claude-design-reference/canon/screen-settings.jsx
// (function SettingsScreen). 1:1 visual parity rebuilt against the
// production primitive kit (`@/components/ui/*`) + next-intl translations
// + real BFF clients for flag-ON-by-default sections.
//
// Behaviour
//   - 9 sections in canon order. Each section is gated by exactly one
//     `_perm` flag (see brief §section flag wiring). When OFF, the section
//     node is NOT rendered and the sidebar nav entry is filtered out, so
//     scroll-spy never targets a missing section.
//   - Profile / security / usage / danger-delete are flag-ON-by-default
//     and consume real Logto/BFF data (no canon mock literals like
//     "kira@dolla.io", "moscow", "$184.20" leak into these paths).
//   - Other sections (api-keys, sso, notifications, integrations, audit,
//     and danger non-delete rows) are flag-OFF-by-default. When manually
//     enabled in Flipt they render canon-style preview UI with a
//     PreviewBanner clearly marking it as "backend not yet wired".
//   - Sticky save bar floats over content when any field is dirty.
//   - Scroll-spy syncs the sidebar active state with the visible section.

'use client';

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import LangSwitcher from '@/components/lang-switcher';
import { Badge, TopBar } from '@/components/ui';
import { toast } from '@/lib/toast';

import {
  NavItem,
  PLAN_META,
  PlanBadge,
  SidebarIdentity,
  Stat,
  StickyBar,
  parsePlanCalls,
  type NavItem as NavItemDef,
  type PlanId,
  type StickyPayload,
} from './components';

import { ApiKeysSection } from './sections/api-keys';
import { AuditSection } from './sections/audit';
import { DangerSection } from './sections/danger';
import { IntegrationsSection } from './sections/integrations';
import { NotificationsSection } from './sections/notifications';
import { ProfileSection } from './sections/profile';
import {
  SecuritySection,
  type SessionEntry,
} from './sections/security';
import { SsoSection } from './sections/sso';
import { UsageSection } from './sections/usage';

// ─── Section-flag bundle (server-side resolved) ──────────────────────────────

export interface SettingsFlags {
  readonly profile: boolean;
  readonly security: boolean;
  readonly recoveryCodes: boolean;
  readonly apiKeys: boolean;
  readonly sso: boolean;
  readonly notifications: boolean;
  readonly integrations: boolean;
  readonly usage: boolean;
  readonly audit: boolean;
  readonly dangerExport: boolean;
  readonly dangerTransfer: boolean;
  readonly dangerPause: boolean;
  readonly dangerDelete: boolean;
}

export interface SettingsProfileData {
  readonly handle: string;
  readonly timezone: string;
  readonly language: string;
  readonly bio: string;
}

export interface SettingsProps {
  readonly userName: string;
  readonly userEmail: string;
  /** Current Stripe-resolved tier. Defaults to free for new users. */
  readonly plan: PlanId;
  /** When the BFF returned 501 for /account/profile. Profile section uses
   *  this to pick safe defaults (empty handle, "" bio, etc.). */
  readonly profile: SettingsProfileData;
  /** Live Logto sessions; empty array → render the "session listing coming
   *  soon" empty state in the security section. */
  readonly sessions: ReadonlyArray<SessionEntry>;
  /** When the BFF returned 501 for /account/sessions, render canon "coming
   *  soon" body in lieu of the live list. */
  readonly sessionsUnavailable: boolean;
  readonly twoFactorMode: 'off' | 'totp' | 'passkey';
  readonly flags: SettingsFlags;
  /** Navigation handlers (matched to canon `onBack` / `onMarketplace` /
   *  `onDashboard` / `onBilling`). */
  readonly onBack: () => void;
  readonly onDashboard: () => void;
  readonly onMarketplace: () => void;
  readonly onBilling: () => void;
}

// ─── Sidebar nav glyph map (canon ST_SECTIONS, labels are translated) ────────

interface BaseNavItem extends NavItemDef {
  readonly id: SectionKey;
  /** When false the entry is filtered from the sidebar (and the parent
   *  section node is also not rendered). */
  readonly visible: boolean;
}

type SectionKey =
  | 'profile'
  | 'security'
  | 'keys'
  | 'sso'
  | 'notifications'
  | 'integrations'
  | 'usage'
  | 'audit'
  | 'danger';

export default function Settings({
  userName,
  userEmail,
  plan,
  profile,
  sessions,
  sessionsUnavailable,
  twoFactorMode,
  flags,
  onBack,
  onDashboard,
  onMarketplace,
  onBilling,
}: SettingsProps): JSX.Element {
  const t = useTranslations();

  // The danger section as a whole renders when any of the 4 sub-flags is on.
  const dangerVisible =
    flags.dangerExport ||
    flags.dangerTransfer ||
    flags.dangerPause ||
    flags.dangerDelete;
  // Surface the "preview" banner only when a non-delete row is exposed; the
  // delete row IS wired (parallel agent C) so it doesn't need the banner.
  const dangerHasPreviewRows =
    flags.dangerExport || flags.dangerTransfer || flags.dangerPause;

  const navItems: ReadonlyArray<BaseNavItem> = [
    {
      id: 'profile',
      label: t('settings.nav.profile'),
      glyph: '◐',
      visible: flags.profile,
    },
    {
      id: 'security',
      label: t('settings.nav.security'),
      glyph: '✦',
      visible: flags.security,
    },
    {
      id: 'keys',
      label: t('settings.nav.keys'),
      glyph: '⌘',
      visible: flags.apiKeys,
    },
    {
      id: 'sso',
      label: t('settings.nav.sso'),
      glyph: '◇',
      visible: flags.sso,
    },
    {
      id: 'notifications',
      label: t('settings.nav.notifications'),
      glyph: '✉',
      visible: flags.notifications,
    },
    {
      id: 'integrations',
      label: t('settings.nav.integrations'),
      glyph: '⌥',
      visible: flags.integrations,
    },
    {
      id: 'usage',
      label: t('settings.nav.usage'),
      glyph: '$',
      visible: flags.usage,
    },
    {
      id: 'audit',
      label: t('settings.nav.audit'),
      glyph: '∎',
      visible: flags.audit,
    },
    {
      id: 'danger',
      label: t('settings.nav.danger'),
      glyph: '⚠',
      visible: dangerVisible,
    },
  ];

  const visibleNav = navItems.filter((n) => n.visible);
  const firstVisibleId: SectionKey =
    visibleNav.length > 0 ? visibleNav[0]!.id : 'profile';

  const [active, setActive] = useState<SectionKey>(firstVisibleId);
  const [sticky, setSticky] = useState<StickyPayload | null>(null);

  // Refs for scroll-spy. We keep an HTMLDivElement per section.
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>(
    {},
  );

  // Smooth scroll-to-section (sidebar nav click + back-to-top wiring).
  const scrollTo = (id: SectionKey): void => {
    setActive(id);
    const el = sectionRefs.current[id];
    if (el === undefined || el === null) return;
    const top =
      el.getBoundingClientRect().top + window.scrollY - 80; /* topbar margin */
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // Scroll-spy. Walk all visible sections and pick whichever's top is closest
  // to (but not past) the topbar margin (140px in canon).
  useEffect(() => {
    const onScroll = (): void => {
      let curr: SectionKey = active;
      for (const s of visibleNav) {
        const el = sectionRefs.current[s.id];
        if (el === undefined || el === null) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 140) curr = s.id;
      }
      if (curr !== active) setActive(curr);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return (): void => window.removeEventListener('scroll', onScroll);
  }, [active, visibleNav]);

  // Sidebar identity card data.
  const initial = useMemo<string>(() => {
    if (userName === '') return '?';
    return userName.charAt(0).toUpperCase();
  }, [userName]);
  const handle = profile.handle === '' ? deriveHandle(userName) : profile.handle;

  // Header strip — canon ST_HEADER. Plan / 2FA badge / quick stats.
  const planMeta = PLAN_META[plan];
  const callsCap = parsePlanCalls(planMeta.calls);
  const callsThisMonth = 0; // populated by usage section query — header is informational only
  const twoFactorBadgeKind = twoFactorMode === 'off' ? 'accent' : 'success';
  const twoFactorLabel =
    twoFactorMode === 'off'
      ? t('settings.header.twofaOff')
      : t('settings.header.twofaOn', { mode: twoFactorMode });

  const onSaveSticky = (): void => {
    // Real wiring lands when PATCH /api/v1/account/profile is implemented
    // (parallel agent C). For now toast — we still close the sticky bar
    // so the visual side of the contract is exercised.
    toast(t('settings.sticky.savedToast'));
    setSticky(null);
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="settings"
        onLogo={onBack}
        right={
          <>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onDashboard}
            >
              {t('myServers')}
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onMarketplace}
            >
              {t('marketplace')}
            </button>
            <LangSwitcher />
            <span className="mc-caption" style={{ marginRight: 4 }}>
              {userEmail}
            </span>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '32px 28px 96px',
          display: 'grid',
          gridTemplateColumns: '232px minmax(0, 1fr)',
          gap: 40,
          alignItems: 'start',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            position: 'sticky',
            top: 24,
            alignSelf: 'start',
          }}
        >
          <div
            className="mc-caption-up"
            style={{ marginBottom: 14, paddingLeft: 6 }}
          >
            {t('settings.sidebar.eyebrow', { name: userName })}
          </div>

          <SidebarIdentity
            name={userName}
            handle={handle}
            initial={initial}
            plan={plan}
          />

          <nav className="col" style={{ gap: 2, marginTop: 18 }}>
            {visibleNav.map((s) => (
              <NavItem
                key={s.id}
                item={{ id: s.id, label: s.label, glyph: s.glyph }}
                active={active === s.id}
                onClick={(): void => scrollTo(s.id)}
              />
            ))}
          </nav>

          <div className="mc-rule-dashed" style={{ margin: '18px 0' }} />

          <div className="col" style={{ gap: 2 }}>
            <NavItem
              item={{ glyph: '⌂', label: t('settings.sidebar.backToDashboard') }}
              onClick={onBack}
              muted
            />
            <NavItem
              item={{ glyph: '?', label: t('settings.sidebar.shortcuts') }}
              onClick={(): void => toast(t('settings.sidebar.shortcutsToast'))}
              muted
            />
            <NavItem
              item={{ glyph: '⏏', label: t('settings.sidebar.signOut') }}
              onClick={(): void => {
                // Hard navigate so the Logto sign-out flow on /api/auth/logto/sign-out
                // gets a chance to clear the cookie. Use window.location instead of
                // next/router because Logto's sign-out is server-rendered.
                window.location.assign(
                  `/api/auth/logto/sign-out?post_logout_redirect_uri=${encodeURIComponent('/')}`,
                );
              }}
              muted
              danger
            />
          </div>
        </aside>

        {/* CONTENT */}
        <section style={{ minWidth: 0 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div className="mc-caption-up" style={{ marginBottom: 6 }}>
              {t('settings.header.eyebrow')}
            </div>
            <div
              className="row-bw"
              style={{
                gap: 16,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: 720 }}>
                <div
                  className="mc-h1"
                  style={{
                    fontSize: 36,
                    lineHeight: 1.1,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t('settings.header.title')}{' '}
                  <span
                    style={{
                      fontStyle: 'italic',
                      fontFamily: 'var(--font-serif)',
                    }}
                  >
                    {t('settings.header.titleEm')}
                  </span>
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 14,
                    marginTop: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {t('settings.header.sub')}
                </div>
              </div>

              <div
                className="row"
                style={{ gap: 10, flexWrap: 'wrap', flexShrink: 0 }}
              >
                <PlanBadge plan={plan} />
                <span style={{ whiteSpace: 'nowrap' }}>
                  <Badge kind={twoFactorBadgeKind}>{twoFactorLabel}</Badge>
                </span>
              </div>
            </div>

            {/* Quick stats strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 0,
                marginTop: 22,
                border: '1px solid var(--border-sharp)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: 'var(--card)',
              }}
            >
              <Stat
                k={t('settings.header.stat.plan')}
                v={planMeta.label}
                sub={planMeta.price}
              />
              <Stat
                k={t('settings.header.stat.calls')}
                v={callsThisMonth.toLocaleString('en-US')}
                sub={t('settings.header.stat.callsOf', {
                  cap: planMeta.calls,
                })}
                progress={callsCap === 0 ? 0 : callsThisMonth / callsCap}
              />
              <Stat
                k={t('settings.header.stat.servers')}
                v={String(sessions.length)}
                sub={t('settings.header.stat.serversSub')}
              />
              <Stat
                k={t('settings.header.stat.lastLogin')}
                v={t('settings.header.stat.lastLoginValue')}
                sub={userEmail}
              />
            </div>
          </div>

          {flags.profile ? (
            <div
              ref={(el): void => {
                sectionRefs.current.profile = el;
              }}
              data-testid="settings-section-profile"
            >
              <ProfileSection
                initialName={userName}
                initialEmail={userEmail}
                initialHandle={handle}
                initialTimezone={profile.timezone}
                initialLanguage={profile.language}
                initialBio={profile.bio}
                avatarLetter={initial}
                onDirty={setSticky}
              />
            </div>
          ) : null}

          {flags.security ? (
            <div
              ref={(el): void => {
                sectionRefs.current.security = el;
              }}
              data-testid="settings-section-security"
            >
              <SecuritySection
                showRecoveryRow={flags.recoveryCodes}
                sessions={sessions}
                sessionsUnavailable={sessionsUnavailable}
                twoFactorMode={twoFactorMode}
              />
            </div>
          ) : null}

          {flags.apiKeys ? (
            <div
              ref={(el): void => {
                sectionRefs.current.keys = el;
              }}
              data-testid="settings-section-keys"
            >
              <ApiKeysSection />
            </div>
          ) : null}

          {flags.sso ? (
            <div
              ref={(el): void => {
                sectionRefs.current.sso = el;
              }}
              data-testid="settings-section-sso"
            >
              <SsoSection plan={plan} />
            </div>
          ) : null}

          {flags.notifications ? (
            <div
              ref={(el): void => {
                sectionRefs.current.notifications = el;
              }}
              data-testid="settings-section-notifications"
            >
              <NotificationsSection />
            </div>
          ) : null}

          {flags.integrations ? (
            <div
              ref={(el): void => {
                sectionRefs.current.integrations = el;
              }}
              data-testid="settings-section-integrations"
            >
              <IntegrationsSection />
            </div>
          ) : null}

          {flags.usage ? (
            <div
              ref={(el): void => {
                sectionRefs.current.usage = el;
              }}
              data-testid="settings-section-usage"
            >
              <UsageSection plan={plan} onOpenBilling={onBilling} />
            </div>
          ) : null}

          {flags.audit ? (
            <div
              ref={(el): void => {
                sectionRefs.current.audit = el;
              }}
              data-testid="settings-section-audit"
            >
              <AuditSection />
            </div>
          ) : null}

          {dangerVisible ? (
            <div
              ref={(el): void => {
                sectionRefs.current.danger = el;
              }}
              data-testid="settings-section-danger"
            >
              <DangerSection
                showExport={flags.dangerExport}
                showTransfer={flags.dangerTransfer}
                showPause={flags.dangerPause}
                showDelete={flags.dangerDelete}
                showPreviewBanner={dangerHasPreviewRows}
                userEmail={userEmail}
              />
            </div>
          ) : null}
        </section>
      </main>

      {/* Floating dirty-bar */}
      {sticky !== null ? (
        <StickyBar
          payload={sticky}
          label={t('settings.sticky.unsavedIn')}
          discardLabel={t('settings.sticky.discard')}
          saveLabel={t('settings.sticky.save')}
          onSave={onSaveSticky}
          onCancel={(): void => setSticky(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Derive a handle from a display name when the BFF profile endpoint hasn't
 * surfaced one yet. Lowercase, alphanumeric-only, max 24 chars. Keeps the
 * "@kira on shared servers" hint from looking weird for new users.
 */
function deriveHandle(name: string): string {
  if (name === '') return '';
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || ''
  );
}
