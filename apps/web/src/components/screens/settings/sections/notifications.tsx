// apps/web/src/components/screens/settings/sections/notifications.tsx
//
// Notifications section — flag-OFF-by-default. 6×4 channel matrix
// (drift / errors / deploys / digest / quotas / security × email / slack /
// in-app / pager). Source of truth: canon StNotifications + StCheckCell.

'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';

import { PreviewBanner, Section, Tag } from '../components';

type ChannelId = 'email' | 'slack' | 'in_app' | 'pager';
type EventId =
  | 'drift'
  | 'errors'
  | 'deploys'
  | 'digest'
  | 'quotas'
  | 'security';

type NotifPrefs = Readonly<Record<EventId, Readonly<Record<ChannelId, boolean>>>>;

const DEFAULT_PREFS: NotifPrefs = {
  drift: { email: true, slack: true, in_app: true, pager: false },
  errors: { email: true, slack: true, in_app: true, pager: true },
  deploys: { email: false, slack: true, in_app: true, pager: false },
  digest: { email: true, slack: false, in_app: false, pager: false },
  quotas: { email: true, slack: false, in_app: true, pager: false },
  security: { email: true, slack: true, in_app: true, pager: true },
};

export function NotificationsSection(): JSX.Element {
  const t = useTranslations();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);

  const toggle = (event: EventId, channel: ChannelId): void => {
    setPrefs((p) => ({
      ...p,
      [event]: { ...p[event], [channel]: !p[event][channel] },
    }));
  };

  const events: ReadonlyArray<{ id: EventId; name: string; hint: string }> = [
    {
      id: 'drift',
      name: t('settings.notif.drift.name'),
      hint: t('settings.notif.drift.hint'),
    },
    {
      id: 'errors',
      name: t('settings.notif.errors.name'),
      hint: t('settings.notif.errors.hint'),
    },
    {
      id: 'deploys',
      name: t('settings.notif.deploys.name'),
      hint: t('settings.notif.deploys.hint'),
    },
    {
      id: 'digest',
      name: t('settings.notif.digest.name'),
      hint: t('settings.notif.digest.hint'),
    },
    {
      id: 'quotas',
      name: t('settings.notif.quotas.name'),
      hint: t('settings.notif.quotas.hint'),
    },
    {
      id: 'security',
      name: t('settings.notif.security.name'),
      hint: t('settings.notif.security.hint'),
    },
  ];

  return (
    <Section
      id="notifications"
      title={t('settings.notif.title')}
      desc={t('settings.notif.desc')}
    >
      <PreviewBanner
        title={t('settings.preview.title')}
        body={t('settings.preview.body')}
      />

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        <div
          className="row"
          style={{
            padding: '8px 14px',
            background: 'var(--paper-alt)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ flex: 1 }}>{t('settings.notif.colEvent')}</div>
          <div style={{ width: 70, textAlign: 'center' }}>
            {t('settings.notif.colEmail')}
          </div>
          <div style={{ width: 70, textAlign: 'center' }}>
            {t('settings.notif.colSlack')}
          </div>
          <div style={{ width: 70, textAlign: 'center' }}>
            {t('settings.notif.colInApp')}
          </div>
          <div style={{ width: 80, textAlign: 'center' }}>
            {t('settings.notif.colPager')}
          </div>
        </div>

        {events.map((r, i) => (
          <div
            key={r.id}
            className="row"
            style={{
              padding: '12px 14px',
              borderTop: i ? '1px dashed var(--border)' : 'none',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, marginBottom: 2 }}>{r.name}</div>
              <div className="mc-caption" style={{ fontSize: 11 }}>
                {r.hint}
              </div>
            </div>
            <CheckCell
              on={prefs[r.id].email}
              onClick={(): void => toggle(r.id, 'email')}
            />
            <CheckCell
              on={prefs[r.id].slack}
              onClick={(): void => toggle(r.id, 'slack')}
            />
            <CheckCell
              on={prefs[r.id].in_app}
              onClick={(): void => toggle(r.id, 'in_app')}
            />
            <CheckCell
              on={prefs[r.id].pager}
              onClick={(): void => toggle(r.id, 'pager')}
              width={80}
            />
          </div>
        ))}
      </div>

      <div
        className="row"
        style={{ gap: 12, marginTop: 14, flexWrap: 'wrap' }}
      >
        <span className="mc-caption">{t('settings.notif.channelsLabel')}</span>
        <Tag>{t('settings.notif.channelEmail')}</Tag>
        <Tag>
          {t('settings.notif.channelSlack')}{' '}
          <span style={{ color: 'var(--success)' }}>· connected</span>
        </Tag>
        <Tag>
          {t('settings.notif.channelPager')}{' '}
          <span style={{ color: 'var(--success)' }}>· connected</span>
        </Tag>
        <a
          className="mc-link mc-mono"
          style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={(): void => toast(t('settings.notif.addChannelToast'))}
        >
          + {t('settings.notif.addChannel')}
        </a>
      </div>
    </Section>
  );
}

interface CheckCellProps {
  readonly on: boolean;
  readonly onClick: () => void;
  readonly width?: number;
}

function CheckCell({ on, onClick, width = 70 }: CheckCellProps): JSX.Element {
  return (
    <div style={{ width, display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className="mc-mono"
        style={{
          width: 22,
          height: 22,
          padding: 0,
          border: '1px solid var(--border-sharp)',
          borderRadius: 4,
          background: on ? 'var(--ink)' : 'var(--card)',
          color: on ? 'var(--paper)' : 'transparent',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        ✓
      </button>
    </div>
  );
}
