// apps/web/src/components/screens/settings/components.tsx
//
// Phase 2 — Settings screen — shared low-level helpers used across all 9
// sections of the settings cabinet.
//
// Source of truth: claude-design-reference/canon/screen-settings.jsx — every
// helper here is a 1:1 visual port of the corresponding `St*` JSX function.
// We drop the `St` prefix in production (Section / Row / Field / NavItem / etc.).
//
// All inline styles intentionally reference canon CSS vars (`--ink`,
// `--paper`, `--paper-alt`, `--card`, `--border`, `--border-sharp`,
// `--text`, `--text-muted`, `--text-faint`, `--success`, `--accent`,
// `--primary`, `--font-sans`, `--font-mono`, `--font-serif`, `--radius`,
// `--radius-lg`, `--shadow`) so the component matches canon byte-for-byte
// after Tailwind / shadcn theming.

'use client';

import type { CSSProperties, JSX, ReactNode } from 'react';
import { useState } from 'react';

// ─── PlanMeta — reused by header, sidebar identity, plan badge, usage ────────

export type PlanId = 'free' | 'pro' | 'team' | 'enterprise';

export interface PlanMeta {
  readonly label: string;
  readonly price: string;
  readonly calls: string;
}

export const PLAN_META: Readonly<Record<PlanId, PlanMeta>> = {
  free: { label: 'free', price: '$0/mo', calls: '50k/mo' },
  pro: { label: 'pro', price: '$29/mo', calls: '500k/mo' },
  team: { label: 'team', price: '$99/mo', calls: '5m/mo' },
  enterprise: { label: 'enterprise', price: 'custom', calls: 'unlimited' },
};

/**
 * Parse "500k/mo" / "5m/mo" / "unlimited" into a numeric cap. Used by
 * progress-bar and quota math. Mirrors canon `parsePlanCalls`.
 */
export function parsePlanCalls(s: string): number {
  if (s === '') return 1;
  if (s === 'unlimited') return Number.POSITIVE_INFINITY;
  const m = s.match(/([\d.]+)([km])/i);
  if (m === null) return 1;
  const n = parseFloat(m[1] ?? '0');
  const unit = (m[2] ?? '').toLowerCase();
  return n * (unit === 'k' ? 1e3 : 1e6);
}

// ─── Section — titled container, ports `StSection` ───────────────────────────

export interface SectionProps {
  readonly id: string;
  readonly title: string;
  readonly desc?: string;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}

export function Section({
  id,
  title,
  desc,
  action,
  children,
}: SectionProps): JSX.Element {
  return (
    <section id={`section-${id}`} style={{ marginBottom: 56 }}>
      <div
        className="row-bw"
        style={{
          marginBottom: 14,
          gap: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>
            · {id} ·
          </div>
          <div
            className="mc-h1"
            style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 4 }}
          >
            {title}
          </div>
          {desc !== undefined && desc !== '' ? (
            <div
              className="muted"
              style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 640 }}
            >
              {desc}
            </div>
          ) : null}
        </div>
        {action !== undefined && action !== null ? (
          <div style={{ flexShrink: 0 }}>{action}</div>
        ) : null}
      </div>
      <div className="mc-rule-dashed" style={{ marginBottom: 14 }} />
      {children}
    </section>
  );
}

// ─── Row — title + meta + action + optional badge, ports `StRow` ─────────────

export interface RowProps {
  readonly title: string;
  readonly meta?: string;
  readonly action?: ReactNode;
  readonly badge?: ReactNode;
}

export function Row({ title, meta, action, badge }: RowProps): JSX.Element {
  return (
    <div
      className="row-bw"
      style={{
        gap: 14,
        padding: '14px 0',
        borderTop: '1px solid var(--border)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="row"
          style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
          {badge}
        </div>
        {meta !== undefined && meta !== '' ? (
          <div className="muted" style={{ fontSize: 12.5 }}>
            {meta}
          </div>
        ) : null}
      </div>
      {action !== undefined && action !== null ? (
        <div style={{ flexShrink: 0 }}>{action}</div>
      ) : null}
    </div>
  );
}

// ─── Field — label + input slot + optional hint/right, ports `StField` ───────

export interface FieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly right?: ReactNode;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

export function Field({
  label,
  hint,
  right,
  children,
  style,
}: FieldProps): JSX.Element {
  return (
    <div style={style}>
      <div
        className="row-bw"
        style={{ marginBottom: 6, gap: 8, minHeight: 16 }}
      >
        <label
          className="mc-caption-up"
          style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}
        >
          {label}
        </label>
        {right}
      </div>
      {children}
      {hint !== undefined && hint !== '' ? (
        <div className="mc-caption" style={{ fontSize: 11, marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ─── NavItem — sidebar nav row, ports `StNavItem` ────────────────────────────

export interface NavItem {
  readonly id?: string;
  readonly label: string;
  readonly glyph: string;
}

export interface NavItemProps {
  readonly item: NavItem;
  readonly active?: boolean;
  readonly onClick?: () => void;
  readonly muted?: boolean;
  readonly danger?: boolean;
}

export function NavItem({
  item,
  active = false,
  onClick,
  muted = false,
  danger = false,
}: NavItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="row"
      style={{
        gap: 10,
        padding: '7px 10px',
        alignItems: 'center',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 'var(--radius)',
        background: active ? 'var(--ink)' : 'transparent',
        color: active
          ? 'var(--paper)'
          : danger
            ? 'var(--accent)'
            : muted
              ? 'var(--text-muted)'
              : 'var(--text)',
        fontSize: 13,
        lineHeight: 1.2,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        className="mc-mono"
        style={{
          width: 18,
          textAlign: 'center',
          fontSize: 12,
          opacity: active ? 1 : 0.7,
        }}
      >
        {item.glyph}
      </span>
      <span>{item.label}</span>
      {active ? (
        <span
          className="mc-mono"
          style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}
        >
          →
        </span>
      ) : null}
    </button>
  );
}

// ─── SidebarIdentity — sticky avatar+name card, ports `StSidebarIdentity` ────

export interface SidebarIdentityProps {
  readonly name: string;
  readonly handle: string;
  readonly initial: string;
  readonly plan: PlanId;
}

export function SidebarIdentity({
  name,
  handle,
  initial,
  plan,
}: SidebarIdentityProps): JSX.Element {
  const meta = PLAN_META[plan];
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid var(--border-sharp)',
        borderRadius: 'var(--radius)',
        background: 'var(--card)',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid var(--border-sharp)',
          background: 'var(--paper-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div
          className="mc-mono"
          style={{ fontSize: 10.5, color: 'var(--text-muted)' }}
        >
          {meta.label} · @{handle}
        </div>
      </div>
    </div>
  );
}

// ─── PlanBadge — capsule "PRO $29/mo", ports `StPlanBadge` ───────────────────

export function PlanBadge({ plan }: { readonly plan: PlanId }): JSX.Element {
  const meta = PLAN_META[plan];
  return (
    <span
      className="mc-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        border: '1px solid var(--border-sharp)',
        borderRadius: 4,
        background: plan === 'enterprise' ? 'var(--ink)' : 'var(--paper-alt)',
        color: plan === 'enterprise' ? 'var(--paper)' : 'var(--text)',
        fontSize: 11.5,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
        {meta.label}
      </span>
      <span style={{ opacity: 0.65 }}>{meta.price}</span>
    </span>
  );
}

// ─── Stat — header strip cell, ports `StStat` ────────────────────────────────

export interface StatProps {
  readonly k: string;
  readonly v: string;
  readonly sub?: string;
  /** 0..1 fraction; renders the canon mini progress strip. */
  readonly progress?: number;
}

export function Stat({ k, v, sub, progress }: StatProps): JSX.Element {
  return (
    <div
      style={{
        padding: 14,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div className="mc-caption-up" style={{ fontSize: 10 }}>
        {k}
      </div>
      <div
        className="mc-mono"
        style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.2 }}
      >
        {v}
      </div>
      {sub !== undefined && sub !== '' ? (
        <div className="mc-caption" style={{ fontSize: 11 }}>
          {sub}
        </div>
      ) : null}
      {progress !== undefined ? (
        <div
          style={{
            height: 3,
            background: 'var(--paper-alt)',
            borderRadius: 1.5,
            marginTop: 4,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(progress * 100, 100)}%`,
              background:
                progress > 0.8 ? 'var(--accent)' : 'var(--primary)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Tag — paper-alt mono pill, ports `StTag` ────────────────────────────────

export function Tag({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <span
      className="mc-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        border: '1px solid var(--border)',
        borderRadius: 4,
        background: 'var(--paper-alt)',
        fontSize: 11.5,
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </span>
  );
}

// ─── Toggle — controlled+uncontrolled rolling pill, ports `StToggle` ─────────

export interface ToggleProps {
  readonly on?: boolean;
  readonly onChange?: (next: boolean) => void;
  readonly ariaLabel?: string;
}

export function Toggle({
  on = false,
  onChange,
  ariaLabel,
}: ToggleProps): JSX.Element {
  // Canon toggle held its own visual state and only called onChange on flip.
  // We keep the same shape so dropping it into a section that doesn't track
  // the boolean still feels canon-correct.
  const [v, setV] = useState<boolean>(on);
  const flip = (): void => {
    const nx = !v;
    setV(nx);
    onChange?.(nx);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={ariaLabel}
      aria-pressed={v}
      style={{
        width: 36,
        height: 20,
        padding: 0,
        border: '1px solid var(--border-sharp)',
        borderRadius: 999,
        background: v ? 'var(--ink)' : 'var(--paper-alt)',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: v ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: v ? 'var(--paper)' : 'var(--ink)',
          transition: 'left .12s',
        }}
      />
    </button>
  );
}

// ─── Empty — empty-state placeholder, ports `StEmpty` ────────────────────────

export interface EmptyProps {
  readonly glyph: string;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

export function Empty({ glyph, title, body, action }: EmptyProps): JSX.Element {
  return (
    <div
      style={{
        border: '1px dashed var(--border-sharp)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px 24px',
        textAlign: 'center',
        background: 'var(--paper-alt)',
      }}
    >
      <div
        className="mc-mono"
        style={{
          width: 44,
          height: 44,
          margin: '0 auto 10px',
          border: '1px solid var(--border-sharp)',
          borderRadius: '50%',
          background: 'var(--card)',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {glyph}
      </div>
      <div className="mc-h2" style={{ fontSize: 18, marginBottom: 6 }}>
        {title}
      </div>
      <div
        className="muted"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: 440,
          margin: '0 auto 14px',
        }}
      >
        {body}
      </div>
      {action}
    </div>
  );
}

// ─── Drawer — right-side overlay, ports `StDrawer` ───────────────────────────
//
// We deliberately use the canon inline-styled overlay (not the global vaul
// host in `lib/drawer.tsx`) because the canon settings drawer renders inside
// the section flow, supports a nested form, and uses canon's exact width
// (`min(520px, 100%)`). Keeping it self-contained matches the canon JSX
// 1:1 and avoids drawer-store coupling for purely-local state.

export interface DrawerProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

export function Drawer({ title, onClose, children }: DrawerProps): JSX.Element {
  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in oklch, var(--ink) 40%, transparent)',
        zIndex: 60,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e): void => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={{
          width: 'min(520px, 100%)',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-sharp)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          className="row-bw"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-sharp)',
            background: 'var(--paper-alt)',
          }}
        >
          <div className="mc-caption-up">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="mc-mono"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--card)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── StickyBar — bottom-floating "save changes" pill, ports `StStickyBar` ────

export interface StickyPayload {
  readonly section: string;
  readonly name?: string;
}

export interface StickyBarProps {
  readonly payload: StickyPayload;
  readonly label: string;
  readonly discardLabel: string;
  readonly saveLabel: string;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function StickyBar({
  payload,
  label,
  discardLabel,
  saveLabel,
  onSave,
  onCancel,
}: StickyBarProps): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 55,
        padding: '10px 14px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: 'var(--ink)',
        color: 'var(--paper)',
        border: '1px solid var(--ink)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 12px 32px rgba(0,0,0,.18)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <span>
        · {label} {payload.section}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="mc-btn mc-btn-sm"
        style={{
          borderColor: 'var(--paper)',
          color: 'var(--paper)',
          background: 'transparent',
        }}
      >
        {discardLabel}
      </button>
      <button
        type="button"
        onClick={onSave}
        className="mc-btn mc-btn-primary mc-btn-sm"
      >
        {saveLabel}
      </button>
    </div>
  );
}

// ─── PreviewBanner — flag-OFF-by-default sections render this banner ─────────
//
// "the canon design was to show what the section will look like once backend
// ships" — when ops flips an _OFF flag to ON we still want to be honest the
// surface is canon mock data, not a live wire-up. Show this thin warn strip
// at the top of the section.

export interface PreviewBannerProps {
  readonly title: string;
  readonly body: string;
}

export function PreviewBanner({
  title,
  body,
}: PreviewBannerProps): JSX.Element {
  return (
    <div
      role="note"
      data-testid="settings-preview-banner"
      style={{
        border: '1px dashed var(--accent)',
        borderRadius: 'var(--radius)',
        background: 'color-mix(in oklch, var(--accent) 6%, var(--card))',
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span
        className="mc-mono"
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--accent)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--accent)',
        }}
      >
        !
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 2,
            color: 'var(--accent)',
          }}
        >
          {title}
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
