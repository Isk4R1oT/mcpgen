// apps/web/src/components/screens/settings/sections/api-keys.tsx
//
// API keys section — flag-OFF-by-default. When the gate is flipped ON the
// canon UI renders with mock data clearly labeled "Preview — backend not
// yet wired" via PreviewBanner. All actions resolve to toasts; NO real BFF
// calls are made. The original purpose of canon was to show what the
// section will look like once backend ships (per brief).
//
// Source of truth: canon StApiKeys / StKeyRow / StCreateKeyDrawer.

'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import {
  Drawer,
  Empty,
  Field,
  PreviewBanner,
  Section,
} from '../components';

interface ApiKey {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: ReadonlyArray<string>;
  readonly expires: string;
  readonly last: string;
  readonly ips: string;
  readonly state: 'active' | 'expired' | 'revoked';
}

// Canon mock — surfaces only when ops flips `ui_settings_api_keys_perm` ON.
// Marked as preview via PreviewBanner so the user knows it isn't live.
const PREVIEW_KEYS: ReadonlyArray<ApiKey> = [
  {
    id: 'k1',
    name: 'production · prod-runner',
    prefix: 'mcp_live_4F8A',
    scopes: ['servers:run', 'tools:invoke'],
    expires: 'no expiry',
    last: '2 min ago',
    ips: '10.0.•••.0/16',
    state: 'active',
  },
  {
    id: 'k2',
    name: 'staging · ci/cd',
    prefix: 'mcp_live_82BC',
    scopes: ['servers:deploy', 'tests:run'],
    expires: 'sep 12, 2026',
    last: '14 min ago',
    ips: 'github actions',
    state: 'active',
  },
  {
    id: 'k3',
    name: 'kira · personal · cli',
    prefix: 'mcp_live_91DA',
    scopes: ['*'],
    expires: 'no expiry',
    last: 'today, 09:42',
    ips: 'any',
    state: 'active',
  },
  {
    id: 'k4',
    name: 'old vercel webhook',
    prefix: 'mcp_live_3E70',
    scopes: ['webhooks:read'],
    expires: 'expired',
    last: '47 days ago',
    ips: 'vercel',
    state: 'expired',
  },
];

const SCOPE_DESC: Readonly<Record<string, string>> = {
  'servers:run': 'invoke any deployed server',
  'tools:invoke': 'call individual tools',
  'servers:deploy': 'create / update / rollback',
  'tests:run': 'run quality + drift tests',
  'webhooks:read': 'read webhook delivery logs',
};

export function ApiKeysSection(): JSX.Element {
  const t = useTranslations();
  const [showCreate, setShowCreate] = useState<boolean>(false);
  // Canon-style local state for the preview-only list. Mutations are
  // ephemeral — refresh wipes them. That's fine for a flag-OFF preview.
  const [keys, setKeys] = useState<ReadonlyArray<ApiKey>>(PREVIEW_KEYS);

  return (
    <Section
      id="keys"
      title={t('settings.apiKeys.title')}
      desc={t('settings.apiKeys.desc')}
      action={
        <button
          type="button"
          className="mc-btn mc-btn-primary mc-btn-sm"
          onClick={(): void => setShowCreate(true)}
        >
          {t('settings.apiKeys.newKey')}
        </button>
      }
    >
      <PreviewBanner
        title={t('settings.preview.title')}
        body={t('settings.preview.body')}
      />

      {keys.length === 0 ? (
        <Empty
          glyph="⌘"
          title={t('settings.apiKeys.emptyTitle')}
          body={t('settings.apiKeys.emptyBody')}
          action={
            <button
              type="button"
              className="mc-btn mc-btn-primary"
              onClick={(): void => setShowCreate(true)}
            >
              {t('settings.apiKeys.createFirst')}
            </button>
          }
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          {keys.map((k, i) => (
            <KeyRow
              key={k.id}
              k={k}
              first={i === 0}
              onRevoke={(): void => {
                setKeys((arr) =>
                  arr.map((x) =>
                    x.id === k.id ? { ...x, state: 'revoked' } : x,
                  ),
                );
                toast(t('settings.apiKeys.revokeToast', { prefix: k.prefix }));
              }}
              onRotate={(): void =>
                toast(t('settings.apiKeys.rotateToast'))
              }
            />
          ))}
        </div>
      )}

      {showCreate ? (
        <CreateKeyDrawer onClose={(): void => setShowCreate(false)} />
      ) : null}
    </Section>
  );
}

// ─── KeyRow ──────────────────────────────────────────────────────────────────

interface KeyRowProps {
  readonly k: ApiKey;
  readonly first: boolean;
  readonly onRevoke: () => void;
  readonly onRotate: () => void;
}

function KeyRow({ k, first, onRevoke, onRotate }: KeyRowProps): JSX.Element {
  const t = useTranslations();
  return (
    <div
      style={{
        padding: '12px 14px',
        borderTop: first ? 'none' : '1px dashed var(--border)',
        opacity: k.state === 'revoked' ? 0.35 : 1,
      }}
    >
      <div
        className="row-bw"
        style={{ gap: 12, marginBottom: 6, alignItems: 'flex-start' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="row"
            style={{ gap: 8, marginBottom: 4, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{k.name}</span>
            {k.state === 'expired' ? (
              <Badge kind="accent">{t('settings.apiKeys.expired')}</Badge>
            ) : null}
            {k.state === 'revoked' ? (
              <Badge kind="accent">{t('settings.apiKeys.revoked')}</Badge>
            ) : null}
            {k.scopes.includes('*') ? (
              <Badge kind="accent">{t('settings.apiKeys.fullAccess')}</Badge>
            ) : null}
          </div>
          <div
            className="mc-mono"
            style={{ fontSize: 12, color: 'var(--text-muted)' }}
          >
            {k.prefix}_••••••••••••••
            <button
              type="button"
              className="mc-mono"
              onClick={(): void =>
                toast(t('settings.apiKeys.copyToast', { prefix: k.prefix }))
              }
              style={{
                marginLeft: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 10.5,
              }}
            >
              [{t('settings.apiKeys.copy')}]
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {k.state === 'active' ? (
            <>
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={onRotate}
              >
                {t('settings.apiKeys.rotate')}
              </button>
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={onRevoke}
              >
                {t('settings.apiKeys.revoke')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mc-btn mc-btn-sm"
              onClick={(): void => toast(t('settings.apiKeys.deleteToast'))}
            >
              {t('settings.apiKeys.delete')}
            </button>
          )}
        </div>
      </div>
      <div
        className="row"
        style={{
          gap: 14,
          fontSize: 11,
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          {t('settings.apiKeys.scopes')}: {k.scopes.join(', ')}
        </span>
        <span>·</span>
        <span>
          {t('settings.apiKeys.expires')}: {k.expires}
        </span>
        <span>·</span>
        <span>
          {t('settings.apiKeys.lastUsed')}: {k.last}
        </span>
        <span>·</span>
        <span>
          {t('settings.apiKeys.ipAllowlist')}: {k.ips}
        </span>
      </div>
    </div>
  );
}

// ─── CreateKeyDrawer ─────────────────────────────────────────────────────────

function CreateKeyDrawer({
  onClose,
}: {
  readonly onClose: () => void;
}): JSX.Element {
  const t = useTranslations();
  const [name, setName] = useState<string>('');
  const [scopes, setScopes] = useState<Record<string, boolean>>({
    'servers:run': true,
    'tools:invoke': true,
    'servers:deploy': false,
    'tests:run': false,
    'webhooks:read': false,
  });
  const [expiry, setExpiry] = useState<string>('90');
  const [ipAllow, setIpAllow] = useState<string>('');
  const [created, setCreated] = useState<string | null>(null);

  const create = (): void => {
    // Preview-only — generate a fake key so the "copy this key now" panel
    // visually demonstrates the canon flow. NO real BFF call is made.
    const r = `mcp_live_${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 14)}`;
    setCreated(r);
  };

  return (
    <Drawer
      title={
        created !== null
          ? t('settings.apiKeys.drawer.createdTitle')
          : t('settings.apiKeys.drawer.newTitle')
      }
      onClose={onClose}
    >
      {created === null ? (
        <div className="col" style={{ gap: 14 }}>
          <Field label={t('settings.apiKeys.drawer.nameLabel')}>
            <input
              className="mc-input"
              placeholder={t('settings.apiKeys.drawer.namePlaceholder')}
              autoFocus
              value={name}
              onChange={(e): void => setName(e.target.value)}
            />
          </Field>

          <Field
            label={t('settings.apiKeys.drawer.scopesLabel')}
            hint={t('settings.apiKeys.drawer.scopesHint')}
          >
            <div className="col" style={{ gap: 6 }}>
              {Object.entries(scopes).map(([s, v]) => (
                <label
                  key={s}
                  className="row"
                  style={{
                    gap: 8,
                    padding: '6px 10px',
                    background: v ? 'var(--paper-alt)' : 'transparent',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(): void =>
                      setScopes((x) => ({ ...x, [s]: !x[s] }))
                    }
                  />
                  <span className="mc-mono" style={{ fontSize: 12 }}>
                    {s}
                  </span>
                  <span
                    className="mc-caption"
                    style={{ fontSize: 11, marginLeft: 'auto' }}
                  >
                    {SCOPE_DESC[s] ?? ''}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <div className="row" style={{ gap: 12 }}>
            <Field
              label={t('settings.apiKeys.drawer.expiresLabel')}
              style={{ flex: 1 }}
            >
              <select
                className="mc-input"
                value={expiry}
                onChange={(e): void => setExpiry(e.target.value)}
              >
                <option value="30">{t('settings.apiKeys.drawer.expiry30')}</option>
                <option value="90">
                  {t('settings.apiKeys.drawer.expiry90')}
                </option>
                <option value="365">
                  {t('settings.apiKeys.drawer.expiry365')}
                </option>
                <option value="never">
                  {t('settings.apiKeys.drawer.expiryNever')}
                </option>
              </select>
            </Field>
            <Field
              label={t('settings.apiKeys.drawer.ipAllowLabel')}
              style={{ flex: 1 }}
            >
              <input
                className="mc-input mc-mono"
                placeholder="10.0.0.0/16, 1.2.3.4/32"
                value={ipAllow}
                onChange={(e): void => setIpAllow(e.target.value)}
              />
            </Field>
          </div>

          <button
            type="button"
            className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full"
            onClick={create}
            disabled={name.trim() === ''}
            style={{ justifyContent: 'center' }}
          >
            {t('settings.apiKeys.drawer.createKey')}
          </button>
        </div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          <div
            className="mc-card"
            style={{
              padding: 16,
              background: 'var(--paper-alt)',
              borderColor: 'var(--accent)',
              borderLeftWidth: 4,
            }}
          >
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>
              {t('settings.apiKeys.drawer.copyNow')}
            </div>
            <div
              className="mc-mono"
              style={{ fontSize: 13, wordBreak: 'break-all', marginBottom: 10 }}
            >
              {created}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={(): void => toast(t('settings.apiKeys.drawer.copied'))}
              >
                [{t('settings.apiKeys.copy')}]
              </button>
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={(): void =>
                  toast(t('settings.apiKeys.drawer.downloaded'))
                }
              >
                {t('settings.apiKeys.drawer.downloadEnv')}
              </button>
            </div>
            <div
              className="mc-caption"
              style={{
                marginTop: 10,
                fontSize: 11.5,
                color: 'var(--accent)',
              }}
            >
              ! {t('settings.apiKeys.drawer.warnOnce')}
            </div>
          </div>
          <button
            type="button"
            className="mc-btn mc-btn-full"
            onClick={onClose}
            style={{ justifyContent: 'center' }}
          >
            {t('settings.apiKeys.drawer.done')}
          </button>
        </div>
      )}
    </Drawer>
  );
}
