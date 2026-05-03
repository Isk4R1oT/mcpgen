// apps/web/src/components/screens/settings/sections/audit.tsx
//
// Audit log section — flag-OFF-by-default. Filtered table
// (all / info / warn / critical) + export csv. Source of truth: canon StAudit.

'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import { Empty, PreviewBanner, Section } from '../components';

type Severity = 'info' | 'warn' | 'critical';

interface AuditRow {
  readonly ts: string;
  readonly actor: string;
  readonly event: string;
  readonly target: string;
  readonly ip: string;
  readonly sev: Severity;
}

// Canon mock — only rendered when the section flag is flipped ON. Marked as
// preview via PreviewBanner so the user knows it's not live data.
const PREVIEW_ROWS: ReadonlyArray<AuditRow> = [
  {
    ts: 'today, 10:14',
    actor: 'kira@dolla.io',
    event: 'api_key.create',
    target: 'mcp_live_4F8A · prod-runner',
    ip: '188.130.•••.42',
    sev: 'info',
  },
  {
    ts: 'today, 09:42',
    actor: 'kira@dolla.io',
    event: 'session.signin',
    target: 'macbook · arc',
    ip: '188.130.•••.42',
    sev: 'info',
  },
  {
    ts: 'yesterday',
    actor: 'system',
    event: 'drift.detected',
    target: 'lumen-payments-mcp',
    ip: '—',
    sev: 'warn',
  },
  {
    ts: '2d ago',
    actor: 'jordan@dolla.io',
    event: 'server.deploy',
    target: 'helio-commerce-mcp v0.18.4',
    ip: 'github actions',
    sev: 'info',
  },
  {
    ts: '2d ago',
    actor: 'kira@dolla.io',
    event: '2fa.enrolled',
    target: 'totp · authenticator',
    ip: '188.130.•••.42',
    sev: 'info',
  },
  {
    ts: '4d ago',
    actor: 'jordan@dolla.io',
    event: 'api_key.revoke',
    target: 'mcp_live_3E70 · old vercel hook',
    ip: '37.193.•••.118',
    sev: 'warn',
  },
  {
    ts: '7d ago',
    actor: 'system',
    event: 'quota.reached_80',
    target: 'tool calls · 400k/500k',
    ip: '—',
    sev: 'warn',
  },
  {
    ts: '12d ago',
    actor: 'kira@dolla.io',
    event: 'sso.config_changed',
    target: 'okta · acme.okta.com',
    ip: '188.130.•••.42',
    sev: 'critical',
  },
];

type Filter = 'all' | Severity;

const FILTERS: ReadonlyArray<Filter> = ['all', 'info', 'warn', 'critical'];

export function AuditSection(): JSX.Element {
  const t = useTranslations();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = PREVIEW_ROWS.filter(
    (r) => filter === 'all' || r.sev === filter,
  );

  return (
    <Section
      id="audit"
      title={t('settings.audit.title')}
      desc={t('settings.audit.desc')}
      action={
        <div className="row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={(): void => setFilter(f)}
              className={`mc-chip ${filter === f ? 'sel' : ''}`}
            >
              {t(`settings.audit.filter.${f}`)}
            </button>
          ))}
          <button
            type="button"
            className="mc-btn mc-btn-sm"
            onClick={(): void => toast(t('settings.audit.exportToast'))}
          >
            {t('settings.audit.export')}
          </button>
        </div>
      }
    >
      <PreviewBanner
        title={t('settings.preview.title')}
        body={t('settings.preview.body')}
      />

      {rows.length === 0 ? (
        <Empty
          glyph="∎"
          title={t('settings.audit.emptyTitle')}
          body={t('settings.audit.emptyBody')}
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 1.4fr 1.6fr 1fr 70px',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--paper-alt)',
              borderBottom: '1px solid var(--border)',
              fontSize: 10.5,
              color: 'var(--text-muted)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            <div>{t('settings.audit.col.when')}</div>
            <div>{t('settings.audit.col.actor')}</div>
            <div>{t('settings.audit.col.event')}</div>
            <div>{t('settings.audit.col.target')}</div>
            <div>{t('settings.audit.col.ip')}</div>
            <div>{t('settings.audit.col.sev')}</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={`${r.ts}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1.4fr 1.6fr 1fr 70px',
                gap: 8,
                padding: '8px 12px',
                borderTop: i ? '1px dashed var(--border)' : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{r.ts}</span>
              <span>{r.actor}</span>
              <span>{r.event}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.target}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.ip}</span>
              <Badge
                kind={
                  r.sev === 'critical'
                    ? 'accent'
                    : r.sev === 'warn'
                      ? 'soft'
                      : 'default'
                }
              >
                {r.sev}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
