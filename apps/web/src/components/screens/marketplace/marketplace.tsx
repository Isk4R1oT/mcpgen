// apps/web/src/components/screens/marketplace/marketplace.tsx
//
// Phase 2 / Agent B4 — Marketplace screen.
//
// Source of truth: claude-design-reference/canon/screen-marketplace.jsx
// (`Marketplace({ onBack, onDashboard, onOpen, onLanding })`). Pixel-faithful
// rebuild against the production primitive kit (`@/components/ui/*`) and
// next-intl translations.
//
// Backend wiring (per B4 brief + SCREEN-BEHAVIORS-CATALOG § marketplace):
//   - `useMarketplaceServers()` is a typed disabled-stub right now (the BFF
//     marketplace endpoints are not implemented). It returns
//     `{ ok: false, error: 'flag_off_or_not_implemented' }` — we surface the
//     canon empty grid with a "coming soon" overlay (canon UI structure
//     preserved entirely, only the listing rows go to zero + an explanatory
//     banner sits where the grid would render).
//   - "Install" CTA on each row + featured banner copies the canon install
//     command and toasts; the real install flow is gated behind
//     `ui_marketplace_install_perm` (post-MVP).
//   - "Publish" CTA in TopBar → routes to /landing (canon behavior).
//   - "Open" → `router.push(\`/marketplace/${serverId}\`)`.
//
// Filter chips, search, sort, scope: client-state only — kept verbatim from
// canon. Autocomplete is preserved as a structural surface (suggesting
// server names matched against the (currently empty) list); when the list
// is empty the autocomplete shows the canon "recent & popular" hint row
// only — no server suggestions can match against an empty list.

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';

import LangSwitcher from '@/components/lang-switcher';
import { Badge, Btn, Icon, TopBar } from '@/components/ui';
import { useMarketplaceServers } from '@/lib/api/marketplace';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Types — canon-shaped server record. The BFF endpoint is missing; until it
// lands we render with an empty list (canon UI structure is preserved).
// ────────────────────────────────────────────────────────────────────────────

export interface MarketplaceServer {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly verified: boolean;
  readonly tools: number;
  readonly stars: number;
  readonly installs: number;
  readonly weekly: number;
  readonly desc: string;
  readonly tags: ReadonlyArray<string>;
  readonly updated: string;
  readonly license: string;
  readonly forks: number;
  readonly mine?: boolean;
}

// Categories list mirrors canon (8 entries) — count comes from filtering the
// rendered server list which is empty until backend lands; we therefore show
// `0` after each label. Once the endpoint exists the counts re-populate.
interface CategoryDef {
  readonly id: string;
  readonly label: string;
}

const CATEGORIES: ReadonlyArray<CategoryDef> = [
  { id: 'all', label: 'all' },
  { id: 'official', label: 'official' },
  { id: 'payments', label: 'payments' },
  { id: 'developer', label: 'developer tools' },
  { id: 'productivity', label: 'productivity' },
  { id: 'ecommerce', label: 'ecommerce' },
  { id: 'database', label: 'database' },
  { id: 'communications', label: 'communications' },
];

// Canon autocomplete recent & tag suggestions — pure UI hints, not
// backend-bound.
const RECENT: ReadonlyArray<string> = ['stripe', 'github', 'postgres'];
const SUGGEST_TAGS: ReadonlyArray<string> = [
  'payments',
  'official',
  'database',
  'github',
  'storage',
];

type SortKey = 'popular' | 'recent' | 'installs' | 'tools';
type ScopeKey = 'all' | 'verified' | 'mine';
type LicenseFilter = 'any' | 'mit' | 'apache';
type UpdatedWithin = 'any' | 'week' | 'month';

interface AcItemBase {
  readonly label: string;
  readonly hint: string;
}
interface AcItemServer extends AcItemBase {
  readonly kind: 'server';
  readonly server: MarketplaceServer;
}
interface AcItemTag extends AcItemBase {
  readonly kind: 'tag';
  readonly q: string;
}
interface AcItemRecent extends AcItemBase {
  readonly kind: 'recent';
}
interface AcItemFallback extends AcItemBase {
  readonly kind: 'fallback';
  readonly q: string;
}
type AcItem = AcItemServer | AcItemTag | AcItemRecent | AcItemFallback;

// ────────────────────────────────────────────────────────────────────────────
// Marketplace screen.
// ────────────────────────────────────────────────────────────────────────────

export default function Marketplace(): ReactElement {
  const t = useTranslations();
  const router = useRouter();

  const queryResult = useMarketplaceServers();
  // BFF endpoint missing → disabled-stub. Canon UI structure preserved; the
  // grid renders empty + the "coming soon" overlay surfaces the disabled
  // state.
  const servers: ReadonlyArray<MarketplaceServer> = useMemo(() => {
    const result = queryResult.data;
    if (result === undefined || result.ok !== true) return [];
    // Phase 2 stub: result schema (`MarketplaceListResponse`) does not yet
    // include all canon fields; until the BFF lands we accept the disabled
    // case and surface zero rows. When the real endpoint ships, map
    // `result.data.servers` → `MarketplaceServer` here.
    return [];
  }, [queryResult.data]);

  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('popular');
  const [query, setQuery] = useState<string>('');
  const [scope, setScope] = useState<ScopeKey>('all');
  const [acFocus, setAcFocus] = useState<boolean>(false);
  const [acIdx, setAcIdx] = useState<number>(0);
  const acRef = useRef<HTMLDivElement | null>(null);

  // Autocomplete: blend of name matches, tag matches, and recent searches.
  const acQuery = query.toLowerCase().trim();
  const acItems: ReadonlyArray<AcItem> = useMemo(() => {
    if (acQuery.length === 0) {
      const recents: ReadonlyArray<AcItem> = RECENT.map((q) => ({
        kind: 'recent' as const,
        label: q,
        hint: 'recent',
      }));
      const tags: ReadonlyArray<AcItem> = SUGGEST_TAGS.slice(0, 4).map((tag) => ({
        kind: 'tag' as const,
        label: `#${tag}`,
        q: tag,
        hint: 'tag',
      }));
      return [...recents, ...tags];
    }
    const matches: AcItem[] = [];
    servers.forEach((s) => {
      if (s.name.toLowerCase().includes(acQuery)) {
        matches.push({
          kind: 'server',
          label: s.name,
          hint: `by ${s.author} · ${s.tools} tools`,
          server: s,
        });
      } else if (s.author.toLowerCase().includes(acQuery)) {
        matches.push({
          kind: 'server',
          label: s.name,
          hint: `by ${s.author}`,
          server: s,
        });
      }
    });
    SUGGEST_TAGS.forEach((tag) => {
      if (tag.includes(acQuery) && tag !== acQuery) {
        matches.push({
          kind: 'tag',
          label: `#${tag}`,
          q: tag,
          hint: 'tag',
        });
      }
    });
    if (matches.length === 0) {
      matches.push({
        kind: 'fallback',
        label: `search "${query}"`,
        hint: 'no exact match',
        q: query,
      });
    }
    return matches.slice(0, 6);
  }, [acQuery, query, servers]);

  useEffect(() => {
    setAcIdx(0);
  }, [query]);

  // Outside-click closes autocomplete (canon behavior).
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (
        acRef.current !== null &&
        e.target instanceof Node &&
        !acRef.current.contains(e.target)
      ) {
        setAcFocus(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return (): void => document.removeEventListener('mousedown', onClick);
  }, []);

  const goToDetail = (serverId: string): void => {
    router.push(`/marketplace/${encodeURIComponent(serverId)}`);
  };

  const pickAc = (item: AcItem): void => {
    if (item.kind === 'server') {
      goToDetail(item.server.id);
    } else if (item.kind === 'tag') {
      setQuery('');
      setCat(item.q);
    } else if (item.kind === 'recent') {
      setQuery(item.label);
    } else {
      setQuery(item.q);
    }
    setAcFocus(false);
  };

  const onAcKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (!acFocus) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcIdx((i) => Math.min(i + 1, acItems.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = acItems[acIdx];
      if (item !== undefined) pickAc(item);
    }
    if (e.key === 'Escape') {
      setAcFocus(false);
    }
  };

  // Expanded filters panel.
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('any');
  const [minStars, setMinStars] = useState<number>(0);
  const [updatedWithin, setUpdatedWithin] = useState<UpdatedWithin>('any');

  const filtered = useMemo<ReadonlyArray<MarketplaceServer>>(() => {
    return servers
      .filter((s) => {
        if (cat !== 'all' && cat !== 'official' && !s.tags.includes(cat))
          return false;
        if (cat === 'official' && !s.verified) return false;
        if (scope === 'verified' && !s.verified) return false;
        if (scope === 'mine' && s.mine !== true) return false;
        if (licenseFilter !== 'any' && s.license !== licenseFilter) return false;
        if (minStars > 0 && s.stars < minStars) return false;
        if (
          updatedWithin === 'week' &&
          !/(hour|day)s?\s+ago|^[1-6]\s+days?/.test(s.updated)
        )
          return false;
        if (
          updatedWithin === 'month' &&
          /weeks?\s+ago/.test(s.updated) &&
          parseInt(s.updated, 10) > 4
        )
          return false;
        if (query.length > 0) {
          const q = query.toLowerCase();
          if (
            !s.name.toLowerCase().includes(q) &&
            !s.desc.toLowerCase().includes(q) &&
            !s.tags.some((tag) => tag.includes(q))
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'recent') return 0;
        if (sort === 'installs') return b.installs - a.installs;
        if (sort === 'tools') return b.tools - a.tools;
        return b.stars - a.stars;
      });
  }, [servers, cat, scope, licenseFilter, minStars, updatedWithin, query, sort]);

  const featured = servers.find((s) => s.id === 'stripe-official');
  const trending = useMemo<ReadonlyArray<MarketplaceServer>>(
    () => [...servers].sort((a, b) => b.weekly - a.weekly).slice(0, 3),
    [servers],
  );
  const activeFilterCount =
    (licenseFilter !== 'any' ? 1 : 0) +
    (minStars > 0 ? 1 : 0) +
    (updatedWithin !== 'any' ? 1 : 0);

  const totalInstalls = servers.reduce((acc, s) => acc + s.installs, 0);

  const onLanding = (): void => {
    router.push('/');
  };
  const onDashboard = (): void => {
    router.push('/dashboard');
  };
  const onPublish = (): void => {
    router.push('/');
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="marketplace"
        onLogo={onLanding}
        right={
          <>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onDashboard}
            >
              {t('myServers')}
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={(): void => toast('opening billing…')}
            >
              {t('billing')}
            </button>
            <LangSwitcher />
            <Btn kind="primary" size="sm" icon="plus" onClick={onPublish}>
              {t('publish')}
            </Btn>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '32px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Hero search */}
        <div style={{ marginBottom: 32 }}>
          <div className="mc-display-l" style={{ marginBottom: 8 }}>
            {t('marketplaceTitle')}
          </div>
          <div
            className="mc-mono muted"
            style={{ fontSize: 13, marginBottom: 20 }}
          >
            {t('marketplaceSub')} · {servers.length} {t('servers')} ·{' '}
            {totalInstalls.toLocaleString()} installs
          </div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div ref={acRef} style={{ flex: 1, position: 'relative' }}>
              <div className="mc-stamp">
                <input
                  className="mc-input mc-mono"
                  placeholder={t('searchSrv')}
                  value={query}
                  onChange={(e): void => {
                    setQuery(e.target.value);
                    setAcFocus(true);
                  }}
                  onFocus={(): void => setAcFocus(true)}
                  onKeyDown={onAcKey}
                  style={{ height: 48, fontSize: 14 }}
                />
              </div>

              {/* Autocomplete dropdown */}
              {acFocus && acItems.length > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--card)',
                    border: '1px solid var(--border-sharp)',
                    borderRadius: 'var(--radius)',
                    boxShadow: 'var(--shadow)',
                    zIndex: 30,
                    overflow: 'hidden',
                  }}
                >
                  {acQuery.length === 0 ? (
                    <div
                      className="mc-caption-up"
                      style={{ padding: '8px 12px 4px', fontSize: 10, opacity: 0.7 }}
                    >
                      recent &amp; popular
                    </div>
                  ) : null}
                  {acItems.map((item, i) => {
                    const itemStyle: CSSProperties = {
                      background: i === acIdx ? 'var(--ink)' : 'transparent',
                      color: i === acIdx ? 'var(--paper)' : 'var(--text)',
                      borderRadius: 0,
                      padding: '10px 14px',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    };
                    const iconName =
                      item.kind === 'server'
                        ? 'cloud'
                        : item.kind === 'tag'
                          ? 'spark'
                          : 'search';
                    return (
                      <div
                        key={`${item.kind}-${item.label}-${i}`}
                        className="mc-cmdk-item"
                        onMouseEnter={(): void => setAcIdx(i)}
                        onMouseDown={(e: ReactMouseEvent<HTMLDivElement>): void => {
                          e.preventDefault();
                          pickAc(item);
                        }}
                        style={itemStyle}
                      >
                        <Icon name={iconName} size={11} />
                        <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 10.5, opacity: 0.65 }}>
                          {item.hint}
                        </span>
                      </div>
                    );
                  })}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderTop: '1px solid var(--border)',
                      fontSize: 10.5,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>↑↓ navigate · ⏎ open · esc close</span>
                    <span>{acItems.length} results</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mc-chiprow" style={{ alignItems: 'stretch' }}>
              {(
                [
                  ['all', t('all')],
                  ['verified', t('verifiedOnly')],
                  ['mine', t('myPublished')],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={`mc-chip ${scope === id ? 'active' : ''}`}
                  onClick={(): void => setScope(id as ScopeKey)}
                  style={{ height: 48, padding: '0 14px' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Advanced filters toggle */}
            <button
              type="button"
              className={`mc-chip ${
                filtersOpen || activeFilterCount > 0 ? 'active' : ''
              }`}
              onClick={(): void => setFiltersOpen((o) => !o)}
              style={{ height: 48, padding: '0 14px' }}
              title="advanced filters"
            >
              <Icon name="spark" size={11} /> filters
              {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
          </div>

          {/* Expandable advanced filter panel */}
          {filtersOpen ? (
            <div className="mc-card" style={{ marginTop: 10, padding: 16 }}>
              <div className="row-bw" style={{ marginBottom: 14 }}>
                <span className="mc-caption-up">advanced filters</span>
                {activeFilterCount > 0 ? (
                  <a
                    className="mc-link"
                    style={{ fontSize: 11 }}
                    onClick={(): void => {
                      setLicenseFilter('any');
                      setMinStars(0);
                      setUpdatedWithin('any');
                    }}
                  >
                    clear all
                  </a>
                ) : null}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 18,
                }}
              >
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>
                    license
                  </div>
                  <div className="mc-chiprow">
                    {(
                      [
                        ['any', 'any'],
                        ['mit', 'mit'],
                        ['apache', 'apache'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={`mc-chip ${licenseFilter === id ? 'active' : ''}`}
                        onClick={(): void => setLicenseFilter(id as LicenseFilter)}
                        style={{ height: 28, fontSize: 11 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>
                    minimum stars
                  </div>
                  <div className="mc-chiprow">
                    {(
                      [
                        [0, 'any'],
                        [100, '100+'],
                        [1000, '1k+'],
                        [2000, '2k+'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        type="button"
                        key={v}
                        className={`mc-chip ${minStars === v ? 'active' : ''}`}
                        onClick={(): void => setMinStars(v)}
                        style={{ height: 28, fontSize: 11 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>
                    updated within
                  </div>
                  <div className="mc-chiprow">
                    {(
                      [
                        ['any', 'any'],
                        ['week', 'week'],
                        ['month', 'month'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={`mc-chip ${updatedWithin === id ? 'active' : ''}`}
                        onClick={(): void => setUpdatedWithin(id as UpdatedWithin)}
                        style={{ height: 28, fontSize: 11 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Featured banner — only when servers exist; canon-default off when empty */}
        {featured !== undefined && query.length === 0 && cat === 'all' && scope === 'all' ? (
          <div
            className="mc-card"
            style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 0 }}>
              <div style={{ padding: 28 }}>
                <div className="mc-caption-up" style={{ marginBottom: 12 }}>
                  featured this week
                </div>
                <div className="mc-h1" style={{ marginBottom: 8 }}>
                  {featured.name}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'var(--text-muted)',
                    marginBottom: 16,
                    maxWidth: 480,
                  }}
                >
                  {featured.desc} written by the {featured.author} platform team.
                  token-optimized down to 76% fewer tokens vs naive 1:1 generation.
                </div>
                <div
                  className="row"
                  style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}
                >
                  {featured.tags.map((tag) => (
                    <Badge key={tag} mono={false}>
                      #{tag}
                    </Badge>
                  ))}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn
                    kind="primary"
                    size="md"
                    iconR="arrow-r"
                    onClick={(): void => goToDetail(featured.id)}
                  >
                    view server
                  </Btn>
                  <Btn
                    kind="ghost"
                    size="md"
                    icon="copy"
                    onClick={(): void => {
                      void navigator.clipboard?.writeText(
                        `mcpgen install ${featured.author}/${featured.name}`,
                      );
                      toast('install command copied');
                    }}
                  >
                    install
                  </Btn>
                </div>
              </div>
              <div
                style={{
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                  padding: 28,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    className="mc-caption-up"
                    style={{ color: 'var(--primary-ink)', opacity: 0.7 }}
                  >
                    this week
                  </div>
                  <div
                    className="mc-mono"
                    style={{
                      fontSize: 56,
                      fontWeight: 500,
                      lineHeight: 1,
                      marginTop: 8,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    +{featured.weekly.toLocaleString()}
                  </div>
                  <div className="mc-mono" style={{ fontSize: 12 }}>
                    installs
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>stars</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>
                      ★ {featured.stars.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>tools</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>
                      {featured.tools}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>forks</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>
                      {featured.forks}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28 }}>
          {/* Sidebar */}
          <aside>
            <div className="mc-caption-up" style={{ marginBottom: 10 }}>
              {t('categories')}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                marginBottom: 24,
              }}
            >
              {CATEGORIES.map((c) => {
                const count =
                  c.id === 'all'
                    ? servers.length
                    : c.id === 'official'
                      ? servers.filter((s) => s.verified).length
                      : servers.filter((s) => s.tags.includes(c.id)).length;
                const cellStyle: CSSProperties = {
                  background: cat === c.id ? 'var(--ink)' : 'transparent',
                  color: cat === c.id ? 'var(--paper)' : 'var(--text)',
                  fontSize: 13,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  border: 0,
                  textAlign: 'left',
                };
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={(): void => setCat(c.id)}
                    className="mc-tool-item"
                    style={cellStyle}
                  >
                    <span className="name">{c.label}</span>
                    <span className="tk">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="mc-caption-up" style={{ marginBottom: 10 }}>
              {t('trending')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trending.map((s, i) => (
                <div
                  key={s.id}
                  onClick={(): void => goToDetail(s.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                    <span
                      className="mc-mono"
                      style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 16 }}
                    >
                      #{i + 1}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="mc-mono"
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.name}
                      </div>
                      <div className="mc-mono muted" style={{ fontSize: 10.5 }}>
                        +{s.weekly.toLocaleString()} this week
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mc-rule" />

            <div className="mc-caption-up" style={{ marginBottom: 8 }}>
              {t('publishOwn')}
            </div>
            <div
              className="mc-mono muted"
              style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}
            >
              {t('publishHint')}
            </div>
            <Btn kind="ghost" size="sm" icon="plus" onClick={onLanding} full>
              {t('buildPub')}
            </Btn>
          </aside>

          {/* Listings */}
          <section>
            <div className="row-bw" style={{ marginBottom: 12 }}>
              <span className="mc-caption-up">
                {filtered.length} {t('servers')} · {cat}
              </span>
              <div className="mc-chiprow">
                {(
                  [
                    ['popular', t('popular')],
                    ['installs', t('mostInstalled')],
                    ['recent', t('recentUpd')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={`mc-chip ${sort === id ? 'active' : ''}`}
                    onClick={(): void => setSort(id as SortKey)}
                    style={{ height: 28, fontSize: 11.5 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((s) => (
                <MarketRow
                  key={s.id}
                  s={s}
                  onOpen={(): void => goToDetail(s.id)}
                />
              ))}
            </div>

            {/* Empty / disabled-stub overlay — canon's empty grid + a
                "coming soon" explainer that surfaces the disabled BFF
                state per the B4 brief. */}
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-lg)',
                }}
                data-testid="marketplace-empty"
              >
                <div className="mc-mono" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  {t('noMatch')}
                </div>
                <div className="mc-mono muted" style={{ fontSize: 12, marginTop: 6 }}>
                  marketplace · coming soon ·{' '}
                  <a className="mc-link" onClick={onLanding}>
                    build your own
                  </a>{' '}
                  in 60 seconds.
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Row card (canon `MarketRow`).
// ────────────────────────────────────────────────────────────────────────────

interface MarketRowProps {
  readonly s: MarketplaceServer;
  readonly onOpen: () => void;
}

function MarketRow({ s, onOpen }: MarketRowProps): ReactElement {
  return (
    <div className="mc-card" style={{ padding: 18, cursor: 'pointer' }} onClick={onOpen}>
      <div className="row-bw" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span className="mc-mono" style={{ fontSize: 15, fontWeight: 500 }}>
              {s.name}
            </span>
            <span className="mc-mono muted" style={{ fontSize: 12 }}>
              by {s.author}
            </span>
            {s.verified ? (
              <Badge kind="ink" mono={false}>
                <Icon name="check" size={9} /> verified
              </Badge>
            ) : null}
            {s.mine === true ? (
              <Badge kind="primary" mono={false}>
                mine
              </Badge>
            ) : null}
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--text)',
              marginBottom: 10,
              maxWidth: 720,
            }}
          >
            {s.desc}
          </div>
          <div
            className="row"
            style={{
              gap: 16,
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
            }}
          >
            <span>★ {s.stars.toLocaleString()}</span>
            <span>{s.installs.toLocaleString()} installs</span>
            <span>{s.tools} tools</span>
            <span>{s.license}</span>
            <span>updated {s.updated}</span>
            <div className="row" style={{ gap: 4 }}>
              {s.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="mc-tk-inline">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          <Btn
            kind="ink"
            size="sm"
            icon="copy"
            onClick={(e): void => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(
                `mcpgen install ${s.author}/${s.name}`,
              );
              toast(`${s.name} · install command copied`);
            }}
          >
            install
          </Btn>
          <span className="mc-mono muted" style={{ fontSize: 11 }}>
            +{s.weekly.toLocaleString()}/wk
          </span>
        </div>
      </div>
    </div>
  );
}
