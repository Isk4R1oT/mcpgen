// apps/web/src/components/screens/account/components.tsx
//
// Phase Frontend Rebuild — Account screen helper components.
//
// Source of truth: claude-design-reference/canon/screen-account.jsx — helper
// functions AcctTabBtn, AcctField, AcctErrorLine, AcctSsoBtn, AcctSentState,
// AcctBackLink, AcctRow (lines 339–441).
//
// 100% visual parity. Inline styles intentionally mirror canon — they
// reference the same CSS-vars (`--ink`, `--text`, `--text-muted`, `--accent`,
// `--card`, `--paper-alt`, `--border`, `--border-sharp`, `--radius`,
// `--success`) the production globals.css already provides.

'use client';

import type {
  CSSProperties,
  JSX,
  MouseEventHandler,
  ReactNode,
} from 'react';

// ─── AcctTabBtn ────────────────────────────────────────────────────────────

export interface AcctTabBtnProps {
  readonly active: boolean;
  readonly onClick: MouseEventHandler<HTMLButtonElement>;
  readonly children: ReactNode;
}

export function AcctTabBtn({
  active,
  onClick,
  children,
}: AcctTabBtnProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mc-mono"
      style={{
        flex: 1,
        padding: '14px 16px',
        border: 'none',
        borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
        background: active ? 'var(--card)' : 'var(--paper-alt)',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        fontSize: 12,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

// ─── AcctField ─────────────────────────────────────────────────────────────

export interface AcctFieldProps {
  readonly label: ReactNode;
  readonly right?: ReactNode;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}

export function AcctField({
  label,
  right,
  children,
  style,
}: AcctFieldProps): JSX.Element {
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
    </div>
  );
}

// ─── AcctErrorLine ─────────────────────────────────────────────────────────

export interface AcctErrorLineProps {
  readonly children: ReactNode;
}

export function AcctErrorLine({ children }: AcctErrorLineProps): JSX.Element {
  return (
    <div
      role="alert"
      className="row"
      style={{
        gap: 8,
        marginTop: 12,
        padding: '8px 10px',
        background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in oklch, var(--accent) 35%, var(--border))',
        borderRadius: 'var(--radius)',
      }}
    >
      <span
        className="mc-mono"
        style={{ fontSize: 11, color: 'var(--accent)' }}
      >
        !
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

// ─── AcctSsoBtn ────────────────────────────────────────────────────────────

export interface AcctSsoBtnProps {
  readonly glyph: string;
  readonly name: string;
  readonly onClick: MouseEventHandler<HTMLButtonElement>;
  readonly compact?: boolean;
  readonly disabled?: boolean;
}

export function AcctSsoBtn({
  glyph,
  name,
  onClick,
  compact = false,
  disabled = false,
}: AcctSsoBtnProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mc-btn"
      style={{
        flex: 1,
        justifyContent: compact ? 'center' : 'flex-start',
        padding: compact ? '10px 12px' : '11px 14px',
        gap: 10,
        fontSize: compact ? 12 : 13.5,
      }}
    >
      <span
        className="mc-mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 22,
          height: 22,
          padding: '0 4px',
          border: '1px solid var(--border-sharp)',
          borderRadius: 4,
          background: 'var(--paper-alt)',
          fontSize: 10.5,
          fontWeight: 600,
        }}
      >
        {glyph}
      </span>
      <span>{name}</span>
    </button>
  );
}

// ─── AcctSentState ─────────────────────────────────────────────────────────

export interface AcctSentStateProps {
  readonly title: ReactNode;
  readonly body: ReactNode;
  readonly onBack: MouseEventHandler<HTMLAnchorElement>;
  readonly backLabel: ReactNode;
}

export function AcctSentState({
  title,
  body,
  onBack,
  backLabel,
}: AcctSentStateProps): JSX.Element {
  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          width: 56,
          height: 56,
          margin: '0 auto 14px',
          border: '1px solid var(--border-sharp)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--paper-alt)',
        }}
      >
        <span className="mc-mono" style={{ fontSize: 22 }}>
          ✉
        </span>
      </div>
      <div className="mc-h2" style={{ textAlign: 'center', marginBottom: 8 }}>
        {title}
      </div>
      <p
        style={{
          textAlign: 'center',
          fontSize: 13.5,
          lineHeight: 1.55,
          color: 'var(--text-muted)',
          margin: 0,
        }}
      >
        {body}
      </p>
      <AcctBackLink onClick={onBack}>{backLabel}</AcctBackLink>
    </div>
  );
}

// ─── AcctBackLink ──────────────────────────────────────────────────────────

export interface AcctBackLinkProps {
  readonly children: ReactNode;
  readonly onClick: MouseEventHandler<HTMLAnchorElement>;
}

export function AcctBackLink({
  children,
  onClick,
}: AcctBackLinkProps): JSX.Element {
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <a
        className="mc-link mc-mono"
        style={{ fontSize: 12, cursor: 'pointer' }}
        onClick={onClick}
      >
        {children}
      </a>
    </div>
  );
}

// ─── AcctRow ───────────────────────────────────────────────────────────────

export interface AcctRowProps {
  readonly glyph: string;
  readonly title: ReactNode;
  readonly body: ReactNode;
}

export function AcctRow({ glyph, title, body }: AcctRowProps): JSX.Element {
  return (
    <div
      className="row"
      style={{ gap: 14, padding: '12px 14px', alignItems: 'flex-start' }}
    >
      <span
        className="mc-mono"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-sharp)',
          borderRadius: 4,
          background: 'var(--paper-alt)',
          fontSize: 12,
        }}
      >
        {glyph}
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          {title}
        </div>
        <div className="mc-caption" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
