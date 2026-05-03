// apps/web/src/components/screens/settings/sections/profile.tsx
//
// Profile section — flag-ON-by-default. Real wiring:
//   - name / email pre-filled from Logto session claims (useLogtoSession()).
//   - timezone / language / bio pre-filled from GET /api/v1/account/profile
//     (the BFF endpoint is added alongside this screen).
//   - any field edit fires onDirty so the parent settings.tsx sticky bar
//     surfaces "save changes". Sticky-save calls PATCH /api/v1/account/profile.
//
// Source of truth: claude-design-reference/canon/screen-settings.jsx
// `StProfile` / `StAvatar`.

'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import { Field, Section, type StickyPayload } from '../components';

export interface ProfileSectionProps {
  /** Authenticated user's display name from Logto. */
  readonly initialName: string;
  /** Authenticated user's email from Logto (verified). */
  readonly initialEmail: string;
  /** Profile metadata loaded server-side from GET /api/v1/account/profile. */
  readonly initialHandle: string;
  readonly initialTimezone: string;
  readonly initialLanguage: string;
  readonly initialBio: string;
  /** Initial value for the avatar fallback letter (capitalised first letter
   *  of the user's name). The canon design renders a serif italic glyph. */
  readonly avatarLetter: string;
  /** Fired on any field edit so the parent surfaces the sticky save bar. */
  readonly onDirty: (payload: StickyPayload) => void;
}

export function ProfileSection({
  initialName,
  initialEmail,
  initialHandle,
  initialTimezone,
  initialLanguage,
  initialBio,
  avatarLetter,
  onDirty,
}: ProfileSectionProps): JSX.Element {
  const t = useTranslations();

  const [name, setName] = useState<string>(initialName);
  const [handle, setHandle] = useState<string>(initialHandle);
  const [email, setEmail] = useState<string>(initialEmail);
  const [tz, setTz] = useState<string>(initialTimezone);
  const [lang, setLang] = useState<string>(initialLanguage);
  const [bio, setBio] = useState<string>(initialBio);

  const fire = (): void => onDirty({ section: 'profile', name });

  return (
    <Section
      id="profile"
      title={t('settings.profile.title')}
      desc={t('settings.profile.desc')}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <Avatar letter={avatarLetter} />
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <Field label={t('settings.profile.fullName')} style={{ flex: 1 }}>
              <input
                className="mc-input"
                value={name}
                onChange={(e): void => {
                  setName(e.target.value);
                  fire();
                }}
              />
            </Field>
            <Field
              label={t('settings.profile.handle')}
              hint={t('settings.profile.handleHint', { handle })}
              style={{ flex: 1 }}
            >
              <div className="row" style={{ gap: 0 }}>
                <span
                  className="mc-mono"
                  style={{
                    border: '1px solid var(--border-sharp)',
                    borderRight: 'none',
                    padding: '0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--paper-alt)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    borderRadius: 'var(--radius) 0 0 var(--radius)',
                    height: 36,
                  }}
                >
                  mcpgen.dev/@
                </span>
                <input
                  className="mc-input mc-mono"
                  value={handle}
                  onChange={(e): void => {
                    setHandle(e.target.value);
                    fire();
                  }}
                  style={{ borderRadius: '0 var(--radius) var(--radius) 0' }}
                />
              </div>
            </Field>
          </div>

          <Field
            label={t('settings.profile.emailPrimary')}
            right={
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(): void =>
                  toast(t('settings.profile.changeEmailToast'))
                }
              >
                {t('settings.profile.changeEmail')}
              </a>
            }
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                className="mc-input mc-mono"
                value={email}
                onChange={(e): void => {
                  setEmail(e.target.value);
                  fire();
                }}
                style={{ flex: 1 }}
              />
              <Badge kind="success">{t('settings.profile.verified')}</Badge>
            </div>
          </Field>

          <div className="row" style={{ gap: 12 }}>
            <Field label={t('settings.profile.timezone')} style={{ flex: 1 }}>
              <select
                className="mc-input"
                value={tz}
                onChange={(e): void => {
                  setTz(e.target.value);
                  fire();
                }}
              >
                {[
                  'Europe/Moscow',
                  'Europe/London',
                  'Europe/Berlin',
                  'America/New_York',
                  'America/Los_Angeles',
                  'Asia/Tokyo',
                  'Asia/Singapore',
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.profile.language')} style={{ flex: 1 }}>
              <select
                className="mc-input"
                value={lang}
                onChange={(e): void => {
                  setLang(e.target.value);
                  fire();
                }}
              >
                <option value="en">english</option>
                <option value="ru">русский</option>
                <option value="de">deutsch</option>
                <option value="fr">français</option>
                <option value="es">español</option>
                <option value="zh">中文</option>
              </select>
            </Field>
          </div>

          <Field
            label={t('settings.profile.bio')}
            hint={t('settings.profile.bioHint')}
          >
            <textarea
              className="mc-input"
              rows={2}
              value={bio}
              onChange={(e): void => {
                setBio(e.target.value);
                fire();
              }}
              style={{
                resize: 'vertical',
                fontFamily: 'var(--font-sans)',
                padding: 10,
              }}
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}

// ─── Avatar — ports `StAvatar` ───────────────────────────────────────────────

function Avatar({ letter }: { readonly letter: string }): JSX.Element {
  const t = useTranslations();
  return (
    <div className="col" style={{ gap: 8, alignItems: 'center' }}>
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '1px solid var(--border-sharp)',
          background: 'var(--paper-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 38,
          color: 'var(--text)',
          position: 'relative',
        }}
      >
        {letter}
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--success)',
            border: '2px solid var(--card)',
          }}
        />
      </div>
      <button
        type="button"
        className="mc-btn mc-btn-sm"
        onClick={(): void => toast(t('settings.profile.uploadAvatarToast'))}
      >
        {t('settings.profile.upload')}
      </button>
      <a
        className="mc-link mc-mono"
        style={{ fontSize: 11, cursor: 'pointer' }}
        onClick={(): void => toast(t('settings.profile.removeAvatarToast'))}
      >
        {t('settings.profile.remove')}
      </a>
    </div>
  );
}
