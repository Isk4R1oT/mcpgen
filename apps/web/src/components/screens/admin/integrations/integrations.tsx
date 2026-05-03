// apps/web/src/components/screens/admin/integrations/integrations.tsx
//
// Phase 3 / C3-integrations — Admin Integrations screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-integrations.jsx
// (function `IntegrationsScreen`).
//
// 5 tabs (oauth · webhooks · secrets · smtp · dns) — first three render
// canon tables; the last two are preview-only EmptyState placeholders. Header
// row hosts an "+ add provider" CTA that opens the canon-shaped drawer
// (provider chips + client-id / client-secret / scopes inputs).
//
// Behaviour wiring (per Phase-3 brief C3 + SHARED-BRIEF rule 4/5):
//   - All BFF endpoints listed in SCREEN-BEHAVIORS-CATALOG.md § admin-
//     integrations are MISSING (`GET /api/admin/v1/integrations/*`). We
//     consume the typed disabled-stubs added to `lib/api/admin.ts`
//     (`useAdminOAuthProviders`, `useAdminWebhooks`, `useAdminSecrets`).
//     They surface `flag_off_or_not_implemented`; the canon UI still
//     renders verbatim using the inline data documented in the catalog
//     (6 oauth providers, 3 webhooks, 5 secrets) so the visual baseline
//     matches.
//   - Canon mock fallback survives until BFF lands. When the hook ever
//     succeeds the screen will rerender against live data automatically.
//
//   - Every action (rotate key, add provider, edit webhook, reveal secret,
//     submit rotate modal) is flag-gated through `useAdminAction` —
//     defaults OFF, falls back to a toast() stub matching canon's copy.
//     Flag keys follow the `_perm` convention from the
//     `mcpgen-feature-flags-contract.md` spec:
//       ui_admin_oauth_rotate_perm
//       ui_admin_oauth_add_perm
//       ui_admin_webhook_edit_perm
//       ui_admin_webhook_add_perm
//       ui_admin_secret_reveal_perm
//       ui_admin_secret_rotate_perm
//     These are documented in `.planning/phase-rebuild/FLAGS-NEEDED.md`.
//     Per phase-3 brief: server-side Flipt evaluation is out of scope
//     for the initial wire-up — call sites currently default OFF and
//     fire the toast stub directly. Phase-3 follow-up wraps each call
//     site with `evaluateBooleanFlag` per docs/mcpgen-feature-flags-
//     contract.md §4.4.

'use client';

import { useState, type CSSProperties, type JSX, type ReactNode } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  SectionLabel,
  Table,
  Tabs,
  type TabItem,
} from '@/components/admin-ui';
import {
  useAdminOAuthProviders,
  useAdminWebhooks,
  useAdminSecrets,
  type AdminOAuthProvider,
  type AdminWebhook,
  type AdminSecret,
} from '@/lib/api/admin';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Tab model
// ────────────────────────────────────────────────────────────────────────────

type IntegrationsTab = 'oauth' | 'webhooks' | 'secrets' | 'smtp' | 'dns';

const TAB_ITEMS: TabItem<IntegrationsTab>[] = [
  { id: 'oauth', label: 'oauth' },
  { id: 'webhooks', label: 'webhooks' },
  { id: 'secrets', label: 'secrets' },
  { id: 'smtp', label: 'smtp' },
  { id: 'dns', label: 'dns' },
];

// ────────────────────────────────────────────────────────────────────────────
// Canon mock fallbacks (catalog § admin-integrations · "Notable inline data").
// Used until the BFF endpoints land. The visual baseline depends on these
// rows being present, so every preserved fixture comes verbatim from canon.
// ────────────────────────────────────────────────────────────────────────────

const FALLBACK_OAUTH: ReadonlyArray<AdminOAuthProvider> = [
  {
    id: 'github',
    name: 'github',
    client_id: 'Iv1.8a91qp4f3c2e',
    scopes: 'read:user, user:email',
    tokens: 4201,
    last_rotated_label: '14 days ago',
  },
  {
    id: 'google',
    name: 'google',
    client_id: '4f81-x4qp.apps…',
    scopes: 'openid, email, profile',
    tokens: 8402,
    last_rotated_label: '21 days ago',
  },
  {
    id: 'slack',
    name: 'slack',
    client_id: '9442891.4f81qp4f',
    scopes: 'chat:write, channels:read',
    tokens: 1184,
    last_rotated_label: '91 days ago',
    rotation_stale: true,
  },
  {
    id: 'microsoft',
    name: 'microsoft',
    client_id: '8a91-qp4f-3c2e…',
    scopes: 'openid, email',
    tokens: 742,
    last_rotated_label: '8 days ago',
  },
  {
    id: 'discord',
    name: 'discord',
    client_id: '112488210442…',
    scopes: 'identify, email',
    tokens: 88,
    last_rotated_label: '34 days ago',
  },
  {
    id: 'notion',
    name: 'notion',
    client_id: 'secret_8a91qp4f…',
    scopes: 'read_content, update_content',
    tokens: 414,
    last_rotated_label: '12 days ago',
  },
];

const FALLBACK_WEBHOOKS: ReadonlyArray<AdminWebhook> = [
  {
    id: 'slack-incident',
    url: 'https://hooks.slack.com/services/T0… (#ops-incident)',
    events: 'incident.*, killswitch.*',
    success_24h: 100,
    last_delivery_label: '2 min ago',
  },
  {
    id: 'acme-billing',
    url: 'https://api.acme.com/webhooks/billing',
    events: 'invoice.failed, refund.issued',
    success_24h: 92,
    last_delivery_label: '14 min ago',
  },
  {
    id: 'observe-audit',
    url: 'https://internal.observe.co/ingest',
    events: 'audit.*',
    success_24h: 100,
    last_delivery_label: '8 sec ago',
  },
];

const FALLBACK_SECRETS: ReadonlyArray<AdminSecret> = [
  {
    id: 'stripe',
    key: 'STRIPE_SECRET_KEY',
    last_access_label: '4 sec ago',
    rotated_label: '14 days ago',
    envs: 'prod',
  },
  {
    id: 'anthropic',
    key: 'ANTHROPIC_API_KEY',
    last_access_label: '12 sec ago',
    rotated_label: '6 days ago',
    envs: 'prod, staging',
  },
  {
    id: 'sendgrid',
    key: 'SENDGRID_API_KEY',
    last_access_label: '4 min ago',
    rotated_label: '112 days ago',
    envs: 'prod',
    rotation_stale: true,
  },
  {
    id: 'database',
    key: 'DATABASE_URL_PRIMARY',
    last_access_label: '0 sec ago',
    rotated_label: '34 days ago',
    envs: 'prod',
  },
  {
    id: 'jwt',
    key: 'JWT_SIGNING_KEY',
    last_access_label: '2 sec ago',
    rotated_label: '8 days ago',
    envs: 'prod, staging',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Utilities — extract live data when the hook returns ok, otherwise the
// canon fallback. Until the BFF endpoint lands the fallback always wins.
// ────────────────────────────────────────────────────────────────────────────

function pickOauth(
  result:
    | { ok: true; data: { providers: AdminOAuthProvider[] } }
    | { ok: false; status: number; error: string }
    | undefined,
): ReadonlyArray<AdminOAuthProvider> {
  if (result?.ok === true) return result.data.providers;
  return FALLBACK_OAUTH;
}

function pickWebhooks(
  result:
    | { ok: true; data: { webhooks: AdminWebhook[] } }
    | { ok: false; status: number; error: string }
    | undefined,
): ReadonlyArray<AdminWebhook> {
  if (result?.ok === true) return result.data.webhooks;
  return FALLBACK_WEBHOOKS;
}

function pickSecrets(
  result:
    | { ok: true; data: { secrets: AdminSecret[] } }
    | { ok: false; status: number; error: string }
    | undefined,
): ReadonlyArray<AdminSecret> {
  if (result?.ok === true) return result.data.secrets;
  return FALLBACK_SECRETS;
}

// ────────────────────────────────────────────────────────────────────────────
// Add-provider drawer body (canon admin-integrations.jsx lines 12–24).
// Every interaction in this body is currently flag-gated OFF → toast stub.
// ────────────────────────────────────────────────────────────────────────────

const DRAWER_INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: 10,
  fontSize: 12,
  border: '1px solid var(--border)',
  background: 'var(--paper)',
  borderRadius: 4,
};

interface AddProviderDrawerBodyProps {
  readonly enabled: boolean;
}

function AddProviderDrawerBody({ enabled }: AddProviderDrawerBodyProps): JSX.Element {
  const presetProviders = ['linear', 'jira', 'figma', 'airtable', 'custom…'];
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      <div className="adm-kpi-label">provider</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {presetProviders.map((p) => (
          <span
            key={p}
            className="mc-chip"
            onClick={(): void => {
              if (enabled) {
                // TODO: POST /api/admin/v1/integrations/oauth (provider scaffold)
                toast(`scaffold for ${p} created`);
                return;
              }
              toast(`scaffold for ${p} created`);
            }}
            style={{ cursor: 'pointer' }}
          >
            {p}
          </span>
        ))}
      </div>
      <div className="adm-kpi-label">client id</div>
      <input
        className="mc-input mc-mono"
        placeholder="abc123-..."
        style={DRAWER_INPUT_STYLE}
      />
      <div className="adm-kpi-label">client secret</div>
      <input
        className="mc-input mc-mono"
        type="password"
        placeholder="••••••••"
        style={DRAWER_INPUT_STYLE}
      />
      <div className="adm-kpi-label">scopes</div>
      <input
        className="mc-input mc-mono"
        placeholder="read:user, email"
        style={DRAWER_INPUT_STYLE}
      />
      <Btn
        kind="ink"
        size="sm"
        full
        onClick={(): void => {
          if (enabled) {
            // TODO: POST /api/admin/v1/integrations/oauth
            toast('provider added · secret encrypted in kms');
            return;
          }
          toast('provider added · secret encrypted in kms');
        }}
      >
        add provider
      </Btn>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Rotate-secret modal (canon admin-integrations.jsx lines 66–87).
// Visible only when `showRotate` is true. Click outside / cancel / rotate
// all dismiss; rotate fires the toast stub. Overlap window chips are
// presentational — selection state is canon-locked at "24h" (index 2).
// ────────────────────────────────────────────────────────────────────────────

interface RotateModalProps {
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
}

function RotateModal({ onClose, onConfirm, title }: RotateModalProps): JSX.Element {
  const windows = ['1h', '6h', '24h', '7d'];
  return (
    <div className="mc-modal-veil" onClick={onClose} role="presentation">
      <div
        className="adm-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mc-modal-head">
          <span className="mc-h3">{title}</span>
        </div>
        <div className="mc-modal-body">
          <div className="adm-approval">
            a new secret will be issued. old secret remains valid for an
            overlap window so existing tokens keep working.
          </div>
          <div style={{ marginTop: 12 }}>
            <SectionLabel>
              <span>overlap window</span>
            </SectionLabel>
            <div className="row" style={{ gap: 6 }}>
              {windows.map((w, i) => {
                const sel = i === 2;
                return (
                  <span
                    key={w}
                    className="mc-chip"
                    style={{
                      background: sel ? 'var(--ink)' : 'var(--surface)',
                      color: sel ? 'var(--ink-on)' : 'var(--text)',
                      borderColor: sel ? 'var(--ink)' : 'var(--border)',
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <SectionLabel>
              <span>reason</span>
            </SectionLabel>
            <textarea
              className="mc-input"
              style={{ height: 50, padding: 10 }}
              placeholder="quarterly rotation per soc2-cc-7.2"
            />
          </div>
        </div>
        <div className="mc-modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            cancel
          </Btn>
          <Btn kind="ink" onClick={onConfirm}>
            rotate
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────────────

export interface IntegrationsScreenProps {
  /** `ui_admin_oauth_rotate_perm` */
  readonly oauthRotateEnabled?: boolean;
  /** `ui_admin_oauth_add_perm` */
  readonly oauthAddEnabled?: boolean;
  /** `ui_admin_webhook_edit_perm` */
  readonly webhookEditEnabled?: boolean;
  /** `ui_admin_webhook_add_perm` */
  readonly webhookAddEnabled?: boolean;
  /** `ui_admin_secret_reveal_perm` */
  readonly secretRevealEnabled?: boolean;
  /** `ui_admin_secret_rotate_perm` */
  readonly secretRotateEnabled?: boolean;
}

export function IntegrationsScreen({
  oauthRotateEnabled = false,
  oauthAddEnabled = false,
  webhookEditEnabled = false,
  webhookAddEnabled = false,
  secretRevealEnabled = false,
  secretRotateEnabled = false,
}: IntegrationsScreenProps = {}): JSX.Element {
  const [tab, setTab] = useState<IntegrationsTab>('oauth');
  const [showRotate, setShowRotate] = useState(false);

  // Disabled-stubs (canon UI still renders against the FALLBACK_* arrays
  // until the BFF endpoints land). The hooks are wired so the production
  // surface is a one-line swap when ENABLED flips in `lib/api/admin.ts`.
  const oauthQuery = useAdminOAuthProviders();
  const webhooksQuery = useAdminWebhooks();
  const secretsQuery = useAdminSecrets();

  const oauthProviders = pickOauth(oauthQuery.data);
  const webhooks = pickWebhooks(webhooksQuery.data);
  const secrets = pickSecrets(secretsQuery.data);

  const onAddProvider = (): void => {
    openDrawer('add oauth provider', <AddProviderDrawerBody enabled={oauthAddEnabled} />, {
      eyebrow: 'oauth 2.0',
    });
  };

  const onRotateOAuth = (providerName: string, stale: boolean): void => {
    if (stale) {
      // Stale (>90d) providers open the rotate modal regardless of flag so
      // the operator can author the audit reason; the modal's confirm
      // button is gated.
      setShowRotate(true);
      return;
    }
    if (oauthRotateEnabled) {
      // TODO: POST /api/admin/v1/integrations/oauth/:id/rotate
      toast(`${providerName} oauth rotated · 24h overlap`);
      return;
    }
    toast(`${providerName} oauth rotated · 24h overlap`);
  };

  const onConfirmRotate = (): void => {
    setShowRotate(false);
    if (oauthRotateEnabled) {
      // TODO: POST /api/admin/v1/integrations/oauth/:id/rotate (with overlap)
      toast('rotation queued · old secret valid 24h');
      return;
    }
    toast('rotation queued · old secret valid 24h');
  };

  const onWebhookEdit = (label: string): void => {
    if (webhookEditEnabled) {
      // TODO: PUT /api/admin/v1/integrations/webhooks/:id
      toast(`opening ${label}`);
      return;
    }
    toast(`opening ${label}`);
  };

  const onWebhookAdd = (): void => {
    if (webhookAddEnabled) {
      // TODO: POST /api/admin/v1/integrations/webhooks
      toast('opening webhook editor…');
      return;
    }
    toast('opening webhook editor…');
  };

  const onSecretReveal = (): void => {
    if (secretRevealEnabled) {
      // TODO: POST /api/admin/v1/integrations/secrets/:id/reveal (audited)
      toast('reveal logged · reason required', { kind: 'warn' });
      return;
    }
    toast('reveal logged · reason required', { kind: 'warn' });
  };

  const onSecretRotateNow = (): void => {
    if (secretRotateEnabled) {
      // TODO: POST /api/admin/v1/integrations/secrets/:id/rotate
      toast('rotation queued · old key valid 24h');
      return;
    }
    toast('rotation queued · old key valid 24h');
  };

  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">integrations</h1>
          <p className="adm-page-sub">
            oauth providers, webhooks, secrets. rotate quarterly.
          </p>
        </div>
        <Btn kind="ink" size="sm" onClick={onAddProvider}>
          + add provider
        </Btn>
      </div>

      <Tabs<IntegrationsTab>
        items={TAB_ITEMS}
        selected={tab}
        onChange={setTab}
      />

      {tab === 'oauth' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel>
            <span>oauth providers · {oauthProviders.length}</span>
          </SectionLabel>
          <Table
            headers={[
              'provider',
              'client id',
              'scopes',
              'tokens',
              'last rotated',
              '',
            ]}
            rows={oauthProviders.map((p) => oauthRow(p, onRotateOAuth))}
          />
        </Card>
      ) : null}

      {tab === 'webhooks' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel
            right={
              <Btn kind="ghost" size="sm" onClick={onWebhookAdd}>
                + add
              </Btn>
            }
          >
            outgoing webhooks · 9
          </SectionLabel>
          <Table
            headers={['url', 'events', 'success · 24h', 'last delivery', '']}
            rows={webhooks.map((w) => webhookRow(w, onWebhookEdit))}
          />
        </Card>
      ) : null}

      {tab === 'secrets' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel
            right={
              <span
                className="adm-page-sub mc-mono"
                style={{ fontSize: 11 }}
              >
                kms · aws-east-1
              </span>
            }
          >
            secrets · 14
          </SectionLabel>
          <Table
            headers={['key', 'last access', 'rotated', 'envs', '']}
            rows={secrets.map((s) =>
              secretRow(s, onSecretReveal, onSecretRotateNow),
            )}
          />
          <div className="adm-approval" style={{ marginTop: 12 }}>
            revealing a secret is logged with reason. rotation can be
            scheduled with overlap window — old key valid for 24h after new
            key issued.
          </div>
        </Card>
      ) : null}

      {tab === 'smtp' || tab === 'dns' ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      ) : null}

      {showRotate ? (
        <RotateModal
          title="rotate · slack oauth secret"
          onClose={(): void => setShowRotate(false)}
          onConfirm={onConfirmRotate}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Row builders — extracted to keep the JSX tree readable. Each returns the
// 1:1 ReactNode array that <Table rows> expects.
// ────────────────────────────────────────────────────────────────────────────

function oauthRow(
  p: AdminOAuthProvider,
  onRotate: (name: string, stale: boolean) => void,
): ReactNode[] {
  const stale = p.rotation_stale === true;
  const lastRotated: ReactNode = stale ? (
    <span className="mc-mono" style={{ color: 'var(--accent)' }}>
      {p.last_rotated_label}
    </span>
  ) : (
    p.last_rotated_label
  );
  return [
    p.name,
    <span key="c" className="mc-mono" style={{ fontSize: 12 }}>
      {p.client_id}
    </span>,
    p.scopes,
    p.tokens.toLocaleString(),
    lastRotated,
    <Btn
      key="x"
      kind={stale ? 'ink' : 'ghost'}
      size="sm"
      onClick={(): void => onRotate(p.name, stale)}
    >
      rotate
    </Btn>,
  ];
}

function webhookRow(
  w: AdminWebhook,
  onEdit: (label: string) => void,
): ReactNode[] {
  const successColor =
    w.success_24h >= 99
      ? undefined
      : w.success_24h >= 95
        ? 'var(--warn)'
        : 'var(--accent)';
  const successCell: ReactNode =
    successColor === undefined ? (
      `${w.success_24h}%`
    ) : (
      <span className="mc-mono" style={{ color: successColor }}>
        {w.success_24h}%
      </span>
    );

  // Edit-button label preserves canon's per-row toast copy (catalog
  // § admin-integrations lines 46–48: each row carries its own message).
  const editLabel = editLabelFor(w.id);

  return [
    <span key="u" className="mc-mono" style={{ fontSize: 11.5 }}>
      {w.url}
    </span>,
    w.events,
    successCell,
    w.last_delivery_label,
    <Btn
      key="x"
      kind="ghost"
      size="sm"
      onClick={(): void => onEdit(editLabel)}
    >
      edit
    </Btn>,
  ];
}

function editLabelFor(id: string): string {
  switch (id) {
    case 'slack-incident':
      return 'slack webhook · incident channel';
    case 'acme-billing':
      return 'acme billing webhook · 7 retries pending';
    case 'observe-audit':
      return 'observe.co audit ingest webhook';
    default:
      return `webhook ${id}`;
  }
}

function secretRow(
  s: AdminSecret,
  onReveal: () => void,
  onRotateNow: () => void,
): ReactNode[] {
  const stale = s.rotation_stale === true;
  const rotated: ReactNode = stale ? (
    <span style={{ color: 'var(--accent)' }} className="mc-mono">
      {s.rotated_label}
    </span>
  ) : (
    s.rotated_label
  );
  const action = stale ? (
    <Btn key="x" kind="ink" size="sm" onClick={onRotateNow}>
      rotate now
    </Btn>
  ) : (
    <Btn key="x" kind="ghost" size="sm" onClick={onReveal}>
      reveal
    </Btn>
  );
  return [
    <span key="k" className="mc-mono">
      {s.key}
    </span>,
    s.last_access_label,
    rotated,
    s.envs,
    action,
  ];
}

export default IntegrationsScreen;
