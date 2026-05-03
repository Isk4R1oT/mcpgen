// apps/web/src/components/screens/admin/admin-shell.tsx
//
// Phase 3 / C1 — admin shell.
//
// Source of truth: claude-design-reference/canon/admin/admin-app.jsx
// (`App()`) + claude-design-reference/canon/admin.css.
//
// Wraps every `/admin/*` route (except `/admin/login`, which renders
// without the shell). Provides:
//   - Logo block (`adm-logo`)
//   - Top bar (search/⌘K, env, density, theme, user identity) via
//     `<AdminTopBar />`
//   - Side nav with 4 groups (ops/people/product/platform), 14 items,
//     selecting based on the current Next.js pathname
//   - Main content slot
//   - Bottom status bar
//   - Cmd+K command palette overlay (basic — keyboard listener +
//     navigate items only; see canon for the full grouped list)
//
// State:
//   - density / theme are persisted on `documentElement.dataset.*` (matching
//     canon) so admin.css selectors `[data-theme="dark"]` / `[data-density]`
//     pick them up. We default to dark + compact (canon defaults).
//   - env / demoState are admin-only UI knobs and are kept in component
//     state. The demoState selector is dev-only — wire to a flag later.
//   - paletteOpen is component-local; ⌘K toggles it.
//
// All BFF calls happen inside per-screen components. The shell never
// fetches admin data itself.

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';

import {
  AdminTopBar,
  type AdminDensity,
  type AdminEnv,
  type AdminTheme,
} from '@/components/admin-ui';

// ─── Nav model ─────────────────────────────────────────────────────────────
//
// Mirrors canon admin-app.jsx `NAV` 1:1. Each item maps to a Next.js route
// under /admin/. `id` matches both the canon screen id and the path slug
// (admin overview is the index `/admin`, so its route is `''`).
interface NavItem {
  id: string;
  /** Path segment after `/admin/`. Empty string means the index route. */
  path: string;
  label: string;
  glyph: string;
  alertCount?: number;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: 'ops',
    items: [
      { id: 'overview', path: '', label: 'overview', glyph: '◐' },
      { id: 'observability', path: 'obs', label: 'observability', glyph: '◇' },
      { id: 'deploys', path: 'deploys', label: 'deploys & infra', glyph: '◆' },
      { id: 'audit', path: 'audit', label: 'audit log', glyph: '※' },
    ],
  },
  {
    group: 'people',
    items: [
      { id: 'users', path: 'users', label: 'users & orgs', glyph: '◯' },
      { id: 'support', path: 'support', label: 'support inbox', glyph: '✉', alertCount: 3 },
      { id: 'broadcast', path: 'broadcast', label: 'broadcast', glyph: '◓' },
    ],
  },
  {
    group: 'product',
    items: [
      { id: 'servers', path: 'servers', label: 'servers', glyph: '⊟' },
      { id: 'moderation', path: 'marketplace', label: 'moderation', glyph: '⚑', alertCount: 8 },
      { id: 'flags', path: 'flags', label: 'flags & exp', glyph: '⚐' },
      { id: 'content', path: 'content', label: 'content', glyph: '¶' },
    ],
  },
  {
    group: 'platform',
    items: [
      { id: 'billing', path: 'billing', label: 'billing', glyph: '$' },
      { id: 'llm', path: 'llm', label: 'llm ops', glyph: '∿' },
      { id: 'integrations', path: 'integrations', label: 'integrations', glyph: '⌬' },
    ],
  },
];

// ─── Utilities ─────────────────────────────────────────────────────────────

/**
 * Map the Next.js `pathname` (e.g. `/admin`, `/admin/users`) to the active
 * NavItem.id. Returns null when the pathname is outside the admin tree.
 */
function pathToActiveId(pathname: string): string | null {
  if (!pathname.startsWith('/admin')) return null;
  // Strip the `/admin` prefix → either '' (overview) or '/<segment>...'.
  const tail = pathname.slice('/admin'.length);
  if (tail === '' || tail === '/') return 'overview';
  // The first segment after /admin/ identifies the screen.
  const seg = tail.split('/').filter(Boolean)[0] ?? '';
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.path === seg) return item.id;
    }
  }
  return null;
}

function navItemHref(item: NavItem): string {
  return item.path === '' ? '/admin' : `/admin/${item.path}`;
}

// ─── User identity chip ────────────────────────────────────────────────────

interface UserChipProps {
  initials: string;
  caption: string;
}

function UserChip({ initials, caption }: UserChipProps): ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--primary)',
          color: 'var(--primary-ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        {initials}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{caption}</span>
    </span>
  );
}

// ─── Command palette (basic) ───────────────────────────────────────────────
//
// Canon admin-app.jsx has 3 grouped sections (navigate / jump-to / actions)
// with 30+ items. C1 implements the navigate group only (deterministic) —
// jump-to/actions need real BFF queries that don't exist yet.

interface CommandPaletteProps {
  onClose: () => void;
  onNavigate: (href: string) => void;
}

function CommandPalette({ onClose, onNavigate }: CommandPaletteProps): ReactElement {
  return (
    <div
      className="adm-palette-veil"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="adm-palette"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <input
          className="adm-palette-input"
          placeholder="type a command, name, or id…"
          autoFocus
        />
        <div className="adm-palette-list">
          <div>
            <div className="adm-palette-cat">navigate</div>
            {NAV.flatMap((g) =>
              g.items.map((it) => (
                <div
                  key={it.id}
                  className="adm-palette-item"
                  onClick={() => onNavigate(navItemHref(it))}
                  role="button"
                  tabIndex={0}
                >
                  <span className="glyph">›</span>
                  <span className="target">go to {it.label}</span>
                </div>
              )),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status bar (bottom) ───────────────────────────────────────────────────

function StatusBar(): ReactElement {
  return (
    <div className="adm-statusbar">
      <span>
        <span className="dot" /> all systems · <span className="v">98.9%</span> uptime · 30d
      </span>
      <span>
        db <span className="v">12ms</span>
      </span>
      <span>
        queue <span className="v">42</span>
      </span>
      <span>
        active sessions <span className="v">1,204</span>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        build <span className="v">a91c4e2</span> · 2 min ago
      </span>
    </div>
  );
}

// ─── Admin shell ───────────────────────────────────────────────────────────

export interface AdminShellProps {
  children?: ReactNode;
  /** Admin user displayed in the top-bar identity chip. */
  user?: { initials: string; caption: string };
}

export function AdminShell({
  children,
  user = { initials: 'JK', caption: 'jana · ops' },
}: AdminShellProps): ReactElement {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin';

  const [theme, setTheme] = useState<AdminTheme>('dark');
  const [density, setDensity] = useState<AdminDensity>('compact');
  const [env, setEnv] = useState<AdminEnv>('prod');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeId = useMemo(() => pathToActiveId(pathname), [pathname]);
  const screenLabel = activeId ?? 'overview';

  // Apply theme + density to <html> dataset for admin.css selectors.
  // Cleanup on unmount → revert to whatever the host page wants.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    return (): void => {
      delete document.documentElement.dataset.theme;
      delete document.documentElement.dataset.density;
    };
  }, [theme, density]);

  // Cmd-K / Esc keyboard listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div
        className="adm-shell"
        data-screen-label={`admin · ${screenLabel}`}
      >
        <div className="adm-logo">
          <span className="mark">m</span>
          <span>mcpgen</span>
          <span className="ops">ops</span>
        </div>

        <AdminTopBar
          onSearchClick={() => setPaletteOpen(true)}
          env={env}
          onEnvChange={setEnv}
          density={density}
          onDensityToggle={() =>
            setDensity((d) => (d === 'compact' ? 'comfy' : 'compact'))
          }
          theme={theme}
          onThemeToggle={() =>
            setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
          }
          user={<UserChip initials={user.initials} caption={user.caption} />}
        />

        <nav className="adm-side" aria-label="admin navigation">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="adm-nav-group">{g.group}</div>
              {g.items.map((it) => {
                const sel = activeId === it.id;
                return (
                  <div
                    key={it.id}
                    className={`adm-nav-item ${sel ? 'sel' : ''}`.trim()}
                    onClick={() => router.push(navItemHref(it))}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(navItemHref(it));
                      }
                    }}
                    aria-current={sel ? 'page' : undefined}
                  >
                    <span className="glyph">{it.glyph}</span>
                    <span className="label">{it.label}</span>
                    {it.alertCount !== undefined ? (
                      <span className="count alert">{it.alertCount}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          <div
            style={{
              padding: '14px 14px 10px',
              borderTop: '1px solid var(--border)',
              marginTop: 12,
            }}
          >
            <a
              href="/"
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ← back to product
            </a>
          </div>
        </nav>

        <main
          className="adm-main"
          data-screen-label={`screen-${screenLabel}`}
        >
          {children}
        </main>
      </div>

      <StatusBar />

      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(href) => {
            router.push(href);
            setPaletteOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
