// apps/web/src/components/screens/settings/sections/danger.tsx
//
// Danger zone — header + 4 destructive rows + ConfirmDrawer with phrase
// confirmation. Each row is gated by its own `_perm` flag:
//   - export   → ui_settings_danger_export_perm   (default OFF)
//   - transfer → ui_settings_danger_transfer_perm (default OFF)
//   - pause    → ui_settings_danger_pause_perm    (default OFF)
//   - delete   → ui_settings_danger_delete_perm   (default ON)
//
// Source of truth: canon StDanger / StDangerRow / StConfirmDrawer.

'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';

import { Drawer, Field, PreviewBanner, Section } from '../components';

export interface DangerSectionProps {
  readonly showExport: boolean;
  readonly showTransfer: boolean;
  readonly showPause: boolean;
  readonly showDelete: boolean;
  /** When true → render PreviewBanner. Set when ANY non-delete row is on
   *  (the wired-up backend is delete-only via parallel agent C). */
  readonly showPreviewBanner: boolean;
  /** Authenticated user's email — used in the confirm drawer copy ("we
   *  will email a signed link to {email}"). */
  readonly userEmail: string;
}

type ConfirmKind = 'export' | 'transfer' | 'pause' | 'delete';

export function DangerSection({
  showExport,
  showTransfer,
  showPause,
  showDelete,
  showPreviewBanner,
  userEmail,
}: DangerSectionProps): JSX.Element {
  const t = useTranslations();
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  // Per brief: if all 4 are OFF the entire section is omitted; that's done
  // by the parent settings.tsx, so this component always has at least one
  // row to render. Build the row list dynamically with `last: true` on the
  // final entry for canon's borderless final rule.
  const rows: ReadonlyArray<{ kind: ConfirmKind; show: boolean }> = [
    { kind: 'export', show: showExport },
    { kind: 'transfer', show: showTransfer },
    { kind: 'pause', show: showPause },
    { kind: 'delete', show: showDelete },
  ];
  const visible = rows.filter((r) => r.show);

  return (
    <Section
      id="danger"
      title={t('settings.danger.title')}
      desc={t('settings.danger.desc')}
    >
      {showPreviewBanner ? (
        <PreviewBanner
          title={t('settings.preview.title')}
          body={t('settings.preview.body')}
        />
      ) : null}

      <div
        style={{
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-lg)',
          background: 'color-mix(in oklch, var(--accent) 4%, var(--card))',
          overflow: 'hidden',
        }}
      >
        {visible.map((r, i) => {
          const last = i === visible.length - 1;
          const titleKey = `settings.danger.${r.kind}.title`;
          const bodyKey = `settings.danger.${r.kind}.body`;
          const ctaKey = `settings.danger.${r.kind}.cta`;
          return (
            <DangerRow
              key={r.kind}
              title={t(titleKey)}
              body={t(bodyKey)}
              cta={t(ctaKey)}
              kind={r.kind === 'delete' ? 'danger' : 'ghost'}
              onClick={(): void => setConfirm(r.kind)}
              last={last}
            />
          );
        })}
      </div>

      {confirm !== null ? (
        <ConfirmDrawer
          kind={confirm}
          userEmail={userEmail}
          onClose={(): void => setConfirm(null)}
        />
      ) : null}
    </Section>
  );
}

// ─── DangerRow ───────────────────────────────────────────────────────────────

interface DangerRowProps {
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly kind: 'ghost' | 'danger';
  readonly onClick: () => void;
  readonly last?: boolean;
}

function DangerRow({
  title,
  body,
  cta,
  kind,
  onClick,
  last = false,
}: DangerRowProps): JSX.Element {
  return (
    <div
      className="row-bw"
      style={{
        padding: '16px 18px',
        gap: 16,
        alignItems: 'flex-start',
        borderBottom: last
          ? 'none'
          : '1px dashed color-mix(in oklch, var(--accent) 30%, var(--border))',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          {title}
        </div>
        <div
          className="muted"
          style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 600 }}
        >
          {body}
        </div>
      </div>
      <button
        type="button"
        className={`mc-btn mc-btn-sm ${kind === 'danger' ? 'mc-btn-danger' : ''}`}
        onClick={onClick}
        style={
          kind === 'danger'
            ? {
                background: 'var(--accent)',
                color: 'white',
                borderColor: 'var(--accent)',
              }
            : undefined
        }
      >
        {cta}
      </button>
    </div>
  );
}

// ─── ConfirmDrawer ───────────────────────────────────────────────────────────

interface ConfirmDrawerProps {
  readonly kind: ConfirmKind;
  readonly userEmail: string;
  readonly onClose: () => void;
}

interface DrawerMeta {
  readonly title: string;
  readonly body: string;
  readonly need: string | false;
  readonly cta: string;
}

function ConfirmDrawer({
  kind,
  userEmail,
  onClose,
}: ConfirmDrawerProps): JSX.Element {
  const t = useTranslations();
  const [phrase, setPhrase] = useState<string>('');
  const [transferEmail, setTransferEmail] = useState<string>('');

  const meta: DrawerMeta =
    kind === 'export'
      ? {
          title: t('settings.danger.export.drawer.title'),
          body: t('settings.danger.export.drawer.body', { email: userEmail }),
          need: false,
          cta: t('settings.danger.export.drawer.cta'),
        }
      : kind === 'transfer'
        ? {
            title: t('settings.danger.transfer.drawer.title'),
            body: t('settings.danger.transfer.drawer.body'),
            need: 'TRANSFER',
            cta: t('settings.danger.transfer.drawer.cta'),
          }
        : kind === 'pause'
          ? {
              title: t('settings.danger.pause.drawer.title'),
              body: t('settings.danger.pause.drawer.body'),
              need: 'PAUSE',
              cta: t('settings.danger.pause.drawer.cta'),
            }
          : {
              title: t('settings.danger.delete.drawer.title'),
              body: t('settings.danger.delete.drawer.body'),
              need: 'DELETE',
              cta: t('settings.danger.delete.drawer.cta'),
            };

  const ok = meta.need === false || phrase === meta.need;

  return (
    <Drawer title={meta.title} onClose={onClose}>
      <p
        className="muted"
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          marginTop: 0,
          marginBottom: 14,
        }}
      >
        {meta.body}
      </p>

      {kind === 'transfer' ? (
        <Field label={t('settings.danger.transfer.drawer.newOwnerLabel')}>
          <input
            className="mc-input mc-mono"
            placeholder={t('settings.danger.transfer.drawer.newOwnerPlaceholder')}
            value={transferEmail}
            onChange={(e): void => setTransferEmail(e.target.value)}
            autoFocus
          />
        </Field>
      ) : null}

      {meta.need !== false ? (
        <Field
          label={t('settings.danger.confirmLabel', { phrase: meta.need })}
          style={{ marginTop: 14 }}
        >
          <input
            className="mc-input mc-mono"
            placeholder={meta.need}
            value={phrase}
            onChange={(e): void => setPhrase(e.target.value)}
            autoFocus={kind !== 'transfer'}
          />
        </Field>
      ) : null}

      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        <button
          type="button"
          className="mc-btn mc-btn-full"
          onClick={onClose}
          style={{ justifyContent: 'center' }}
        >
          {t('settings.danger.drawer.cancel')}
        </button>
        <button
          type="button"
          className="mc-btn mc-btn-full"
          disabled={!ok}
          onClick={(): void => {
            // Until parallel agent C wires DELETE /api/v1/account etc., all
            // confirmations resolve to a toast — including delete (the only
            // flag-ON-by-default row). Brief explicitly says: "if endpoint
            // not ready, button → toast."
            toast(t('settings.danger.queuedToast', { cta: meta.cta }));
            onClose();
          }}
          style={{
            justifyContent: 'center',
            background: kind === 'delete' ? 'var(--accent)' : 'var(--ink)',
            color: kind === 'delete' ? 'white' : 'var(--paper)',
            borderColor: kind === 'delete' ? 'var(--accent)' : 'var(--ink)',
            opacity: ok ? 1 : 0.4,
          }}
        >
          {meta.cta}
        </button>
      </div>
    </Drawer>
  );
}
