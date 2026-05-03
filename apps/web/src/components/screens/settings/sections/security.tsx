// apps/web/src/components/screens/settings/sections/security.tsx
//
// Security section — flag-ON-by-default. Source of truth:
// claude-design-reference/canon/screen-settings.jsx StSecurity / StPasswordRow
// / StTwoFactor / St2faMethod / StRecoveryRow / StSessionsRow.
//
// Backend wiring:
//   - Password change → opens drawer that calls
//     POST /api/auth/embedded/change-password (parallel agent C). Until that
//     endpoint lands the button surfaces a toast (canon-style copy).
//   - 2FA enrollment → toast for now (Logto Embedded TOTP enrollment is
//     parallel-agent-C scope).
//   - Sessions list → GET /api/v1/account/sessions. The BFF returns 501 until
//     Logto sessions API is wired; we render the canon "session listing
//     coming soon" empty state in that case.
//
// `recoveryFlag` gates ONLY the recovery-codes row (per brief §section flag
// wiring). Password / 2FA / sessions stay visible regardless.

'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import { Empty, Row, Section } from '../components';

export interface SessionEntry {
  readonly id: string;
  readonly isCurrent: boolean;
  readonly device: string;
  readonly ip: string;
  readonly location: string;
  readonly when: string;
  readonly osGlyph: string;
}

export interface SecuritySectionProps {
  /** Flag — show the recovery-codes row. Default canon behaviour is hidden. */
  readonly showRecoveryRow: boolean;
  /** Active sessions; empty array → canon "coming soon" empty state. */
  readonly sessions: ReadonlyArray<SessionEntry>;
  /** When the BFF returns 501 the parent passes true so we render the
   *  "session listing coming soon" empty body verbatim. */
  readonly sessionsUnavailable: boolean;
  /** Current 2FA mode reported by Logto; `'off'` triggers the disabled
   *  badge. Defaults to `'off'` until embedded enrollment ships. */
  readonly twoFactorMode: 'off' | 'totp' | 'passkey';
}

export function SecuritySection({
  showRecoveryRow,
  sessions,
  sessionsUnavailable,
  twoFactorMode,
}: SecuritySectionProps): JSX.Element {
  const t = useTranslations();

  return (
    <Section
      id="security"
      title={t('settings.security.title')}
      desc={t('settings.security.desc')}
    >
      <PasswordRow />
      <TwoFactor mode={twoFactorMode} />
      {showRecoveryRow ? <RecoveryRow /> : null}
      <SessionsRow
        sessions={sessions}
        sessionsUnavailable={sessionsUnavailable}
      />
    </Section>
  );
}

// ─── PasswordRow ─────────────────────────────────────────────────────────────

function PasswordRow(): JSX.Element {
  const t = useTranslations();
  return (
    <Row
      title={t('settings.security.password.title')}
      meta={t('settings.security.password.meta')}
      action={
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={(): void =>
            toast(t('settings.security.password.changeToast'))
          }
        >
          {t('settings.security.password.change')}
        </button>
      }
    />
  );
}

// ─── TwoFactor ───────────────────────────────────────────────────────────────

function TwoFactor({
  mode,
}: {
  readonly mode: 'off' | 'totp' | 'passkey';
}): JSX.Element {
  const t = useTranslations();
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
      <div className="row-bw" style={{ marginBottom: 10, gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {t('settings.security.twofa.title')}
            </span>
            {mode === 'off' ? (
              <Badge kind="accent">
                {t('settings.security.twofa.disabled')}
              </Badge>
            ) : (
              <Badge kind="success">
                {t('settings.security.twofa.enabled', { mode })}
              </Badge>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {t('settings.security.twofa.desc')}
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <TwoFactorMethod
          glyph="◉"
          name={t('settings.security.twofa.totp.name')}
          desc={t('settings.security.twofa.totp.desc')}
          status={
            mode === 'totp' ? 'active' : mode === 'off' ? 'off' : 'available'
          }
        />
        <TwoFactorMethod
          glyph="◈"
          name={t('settings.security.twofa.passkey.name')}
          desc={t('settings.security.twofa.passkey.desc')}
          status={
            mode === 'passkey'
              ? t('settings.security.twofa.passkey.activeStatus')
              : t('settings.security.twofa.passkey.recommendedStatus')
          }
          recommended
        />
        <TwoFactorMethod
          glyph="✉"
          name={t('settings.security.twofa.sms.name')}
          desc={t('settings.security.twofa.sms.desc')}
          status="off"
          locked
        />
      </div>
    </div>
  );
}

interface TwoFactorMethodProps {
  readonly glyph: string;
  readonly name: string;
  readonly desc: string;
  readonly status: string;
  readonly recommended?: boolean;
  readonly locked?: boolean;
}

function TwoFactorMethod({
  glyph,
  name,
  desc,
  status,
  recommended = false,
  locked = false,
}: TwoFactorMethodProps): JSX.Element {
  const t = useTranslations();
  const isActive = status.startsWith('active');
  return (
    <div
      className="row"
      style={{
        gap: 14,
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: status === 'off' ? 'transparent' : 'var(--paper-alt)',
        alignItems: 'flex-start',
      }}
    >
      <span
        className="mc-mono"
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-sharp)',
          borderRadius: 4,
          background: 'var(--card)',
          fontSize: 13,
        }}
      >
        {glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="row"
          style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{name}</span>
          {recommended ? (
            <Badge kind="soft">{t('settings.security.twofa.recommended')}</Badge>
          ) : null}
          {locked ? (
            <Badge kind="default">
              {t('settings.security.twofa.policyBackup')}
            </Badge>
          ) : null}
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <div
        className="col"
        style={{ gap: 6, alignItems: 'flex-end', flexShrink: 0 }}
      >
        <span
          className="mc-caption"
          style={{
            fontSize: 11,
            color: isActive ? 'var(--success)' : 'var(--text-muted)',
          }}
        >
          {status}
        </span>
        {!locked ? (
          <button
            type="button"
            className="mc-btn mc-btn-sm"
            onClick={(): void =>
              toast(
                isActive
                  ? t('settings.security.twofa.manageToast')
                  : t('settings.security.twofa.enrollToast'),
              )
            }
          >
            {isActive
              ? t('settings.security.twofa.manage')
              : t('settings.security.twofa.enroll')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── RecoveryRow ─────────────────────────────────────────────────────────────

function RecoveryRow(): JSX.Element {
  const t = useTranslations();
  return (
    <Row
      title={t('settings.security.recovery.title')}
      meta={t('settings.security.recovery.meta')}
      action={
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="mc-btn mc-btn-sm"
            onClick={(): void =>
              toast(t('settings.security.recovery.downloadToast'))
            }
          >
            {t('settings.security.recovery.download')}
          </button>
          <button
            type="button"
            className="mc-btn mc-btn-sm"
            onClick={(): void =>
              toast(t('settings.security.recovery.regenerateToast'))
            }
          >
            {t('settings.security.recovery.regenerate')}
          </button>
        </div>
      }
    />
  );
}

// ─── SessionsRow ─────────────────────────────────────────────────────────────

function SessionsRow({
  sessions,
  sessionsUnavailable,
}: {
  readonly sessions: ReadonlyArray<SessionEntry>;
  readonly sessionsUnavailable: boolean;
}): JSX.Element {
  const t = useTranslations();
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set());

  // If the parent flips sessionsUnavailable, clear local revoke state to keep
  // the UI consistent (no orphan opacity .4 rows after the list disappears).
  useEffect(() => {
    if (sessionsUnavailable) setRevoked(new Set());
  }, [sessionsUnavailable]);

  if (sessionsUnavailable) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
        <div className="row-bw" style={{ marginBottom: 10 }}>
          <div>
            <div
              style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}
            >
              {t('settings.security.sessions.title', { count: 0 })}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {t('settings.security.sessions.desc')}
            </div>
          </div>
        </div>
        <Empty
          glyph="✦"
          title={t('settings.security.sessions.unavailableTitle')}
          body={t('settings.security.sessions.unavailableBody')}
        />
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
      <div className="row-bw" style={{ marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {t('settings.security.sessions.title', {
              count: sessions.length - revoked.size,
            })}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {t('settings.security.sessions.desc')}
          </div>
        </div>
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={(): void => {
            setRevoked(
              new Set(sessions.filter((s) => !s.isCurrent).map((s) => s.id)),
            );
            toast(t('settings.security.sessions.signOutAllToast'));
          }}
        >
          {t('settings.security.sessions.signOutAll')}
        </button>
      </div>

      {sessions.length === 0 ? (
        <Empty
          glyph="✦"
          title={t('settings.security.sessions.emptyTitle')}
          body={t('settings.security.sessions.emptyBody')}
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          {sessions.map((s, i) => {
            const gone = revoked.has(s.id);
            return (
              <div
                key={s.id}
                className="row"
                style={{
                  gap: 14,
                  padding: '10px 14px',
                  borderTop: i ? '1px dashed var(--border)' : 'none',
                  opacity: gone ? 0.4 : 1,
                  alignItems: 'center',
                }}
              >
                <span
                  className="mc-mono"
                  style={{
                    width: 24,
                    height: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-sharp)',
                    borderRadius: 4,
                    background: 'var(--paper-alt)',
                    fontSize: 12,
                  }}
                >
                  {s.osGlyph}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="row"
                    style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}
                  >
                    <span style={{ fontSize: 13 }}>{s.device}</span>
                    {s.isCurrent ? (
                      <Badge kind="success">
                        {t('settings.security.sessions.thisDevice')}
                      </Badge>
                    ) : null}
                    {gone ? (
                      <Badge kind="accent">
                        {t('settings.security.sessions.revoked')}
                      </Badge>
                    ) : null}
                  </div>
                  <div
                    className="mc-mono"
                    style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                  >
                    {s.ip} · {s.location} · {s.when}
                  </div>
                </div>
                {!s.isCurrent && !gone ? (
                  <button
                    type="button"
                    className="mc-btn mc-btn-sm"
                    onClick={(): void => {
                      setRevoked((r) => new Set([...r, s.id]));
                      toast(
                        t('settings.security.sessions.revokeToast', {
                          device: s.device.split(' · ')[0] ?? s.device,
                        }),
                      );
                    }}
                  >
                    {t('settings.security.sessions.revoke')}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
