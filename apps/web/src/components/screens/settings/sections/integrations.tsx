// apps/web/src/components/screens/settings/sections/integrations.tsx
//
// Integrations section — flag-OFF-by-default. 7 service cards in a grid
// (slack / github / pagerduty / sentry / datadog / linear / webhook).
// Source of truth: canon StIntegrations + StIntegrationCard.

'use client';

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import { PreviewBanner, Section } from '../components';

interface IntegrationDef {
  readonly id: string;
  readonly glyph: string;
  readonly state: 'connected' | 'available';
  /** Optional connected meta (workspace / org / endpoint). */
  readonly metaKey?: string;
}

const INTEGRATIONS: ReadonlyArray<IntegrationDef> = [
  {
    id: 'slack',
    glyph: '#',
    state: 'connected',
    metaKey: 'settings.integ.slack.meta',
  },
  {
    id: 'github',
    glyph: 'GH',
    state: 'connected',
    metaKey: 'settings.integ.github.meta',
  },
  {
    id: 'pagerduty',
    glyph: 'PD',
    state: 'connected',
    metaKey: 'settings.integ.pagerduty.meta',
  },
  { id: 'sentry', glyph: 'S', state: 'available' },
  { id: 'datadog', glyph: 'DD', state: 'available' },
  { id: 'linear', glyph: 'L', state: 'available' },
  {
    id: 'webhook',
    glyph: '⌁',
    state: 'connected',
    metaKey: 'settings.integ.webhook.meta',
  },
];

export function IntegrationsSection(): JSX.Element {
  const t = useTranslations();
  return (
    <Section
      id="integrations"
      title={t('settings.integ.title')}
      desc={t('settings.integ.desc')}
    >
      <PreviewBanner
        title={t('settings.preview.title')}
        body={t('settings.preview.body')}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {INTEGRATIONS.map((i) => (
          <IntegrationCard key={i.id} def={i} />
        ))}
      </div>
    </Section>
  );
}

function IntegrationCard({
  def,
}: {
  readonly def: IntegrationDef;
}): JSX.Element {
  const t = useTranslations();
  const name = t(`settings.integ.${def.id}.name`);
  const desc = t(`settings.integ.${def.id}.desc`);
  const meta = def.metaKey !== undefined ? t(def.metaKey) : null;

  return (
    <div
      style={{
        border: '1px solid var(--border-sharp)',
        borderRadius: 'var(--radius)',
        background: 'var(--card)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span
          className="mc-mono"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-sharp)',
            borderRadius: 4,
            background: 'var(--paper-alt)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {def.glyph}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{name}</span>
            {def.state === 'connected' ? (
              <Badge kind="success">{t('settings.integ.connected')}</Badge>
            ) : null}
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
      </div>
      {meta !== null ? (
        <div
          className="mc-caption"
          style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
        >
          {meta}
        </div>
      ) : null}
      <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
        {def.state === 'connected' ? (
          <>
            <button
              type="button"
              className="mc-btn mc-btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={(): void =>
                toast(t('settings.integ.configureToast', { name }))
              }
            >
              {t('settings.integ.configure')}
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-sm"
              onClick={(): void =>
                toast(t('settings.integ.disconnectToast', { name }))
              }
            >
              {t('settings.integ.disconnect')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mc-btn mc-btn-primary mc-btn-sm"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={(): void =>
              toast(t('settings.integ.connectToast', { name }))
            }
          >
            {t('settings.integ.connect')}
          </button>
        )}
      </div>
    </div>
  );
}
