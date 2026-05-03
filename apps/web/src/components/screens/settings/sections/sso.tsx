// apps/web/src/components/screens/settings/sections/sso.tsx
//
// SSO & SAML section — flag-OFF-by-default. Has two distinct visual modes:
//   - Non-enterprise plan: gated CTA "talk to sales" with the dashed
//     paper-alt card layout.
//   - Enterprise plan: 4 rows (idp, domain, scim, enforce toggle).
//
// Source of truth: canon StSso.

'use client';

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui';
import { toast } from '@/lib/toast';

import {
  PreviewBanner,
  Row,
  Section,
  Toggle,
  type PlanId,
} from '../components';

export interface SsoSectionProps {
  readonly plan: PlanId;
}

export function SsoSection({ plan }: SsoSectionProps): JSX.Element {
  const t = useTranslations();
  const enterprise = plan === 'enterprise';

  return (
    <Section
      id="sso"
      title={t('settings.sso.title')}
      desc={t('settings.sso.desc')}
    >
      <PreviewBanner
        title={t('settings.preview.title')}
        body={t('settings.preview.body')}
      />

      {!enterprise ? (
        <div
          style={{
            border: '1px dashed var(--border-sharp)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            background: 'var(--paper-alt)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Badge kind="accent">
                {t('settings.sso.enterpriseBadge')}
              </Badge>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {t('settings.sso.headline')}
              </span>
            </div>
            <div
              className="muted"
              style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 600 }}
            >
              {t('settings.sso.body')}
            </div>
          </div>
          <button
            type="button"
            className="mc-btn mc-btn-primary"
            onClick={(): void => toast(t('settings.sso.talkSalesToast'))}
          >
            {t('settings.sso.talkSales')}
          </button>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <Row
            title={t('settings.sso.idp.title')}
            meta={t('settings.sso.idp.meta')}
            badge={
              <Badge kind="success">
                {t('settings.sso.idp.connected')}
              </Badge>
            }
            action={
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={(): void =>
                  toast(t('settings.sso.idp.configureToast'))
                }
              >
                {t('settings.sso.idp.configure')}
              </button>
            }
          />
          <Row
            title={t('settings.sso.domain.title')}
            meta={t('settings.sso.domain.meta')}
            badge={
              <Badge kind="success">
                {t('settings.sso.domain.verified')}
              </Badge>
            }
            action={
              <button
                type="button"
                className="mc-btn mc-btn-sm"
                onClick={(): void =>
                  toast(t('settings.sso.domain.verifyToast'))
                }
              >
                {t('settings.sso.domain.verify')}
              </button>
            }
          />
          <Row
            title={t('settings.sso.scim.title')}
            meta={t('settings.sso.scim.meta')}
            badge={
              <Badge kind="success">{t('settings.sso.scim.active')}</Badge>
            }
            action={
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="mc-btn mc-btn-sm"
                  onClick={(): void =>
                    toast(t('settings.sso.scim.rotateToast'))
                  }
                >
                  {t('settings.sso.scim.rotate')}
                </button>
                <button
                  type="button"
                  className="mc-btn mc-btn-sm"
                  onClick={(): void => toast(t('settings.sso.scim.logsToast'))}
                >
                  {t('settings.sso.scim.logs')}
                </button>
              </div>
            }
          />
          <Row
            title={t('settings.sso.enforce.title')}
            meta={t('settings.sso.enforce.meta')}
            action={
              <Toggle
                on
                onChange={(): void =>
                  toast(t('settings.sso.enforce.toggleToast'))
                }
                ariaLabel={t('settings.sso.enforce.title')}
              />
            }
          />
        </div>
      )}
    </Section>
  );
}
