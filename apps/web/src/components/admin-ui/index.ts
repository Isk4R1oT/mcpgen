// apps/web/src/components/admin-ui/index.ts
//
// Phase 3 / C1 — admin-ui kit barrel export.
//
// All admin-only primitives + re-exports of the canon main-kit primitives
// that admin screens reuse (Btn, Card, Badge, Icon, SectionLabel). C2/C3/C4
// admin screens import everything from `@/components/admin-ui` so they
// never have to cross over to `@/components/ui`.

// — Re-exports of canon main kit (admin shares the visual contract) —
export { Btn } from './btn';
export type { BtnKind, BtnProps, BtnSize } from './btn';

export { Card } from './card';
export type { CardProps } from './card';

export { Badge } from './badge';
export type { BadgeKind, BadgeProps } from './badge';

export { Icon } from './icon';
export type { IconName, IconProps } from './icon';

export { SectionLabel } from './section-label';
export type { SectionLabelProps } from './section-label';

// — Admin-specific primitives (mirrors canon admin-ui.jsx) —
export { Pill } from './pill';
export type { PillKind, PillProps } from './pill';

export { Sparkline } from './sparkline';
export type { SparklineKind, SparklineProps } from './sparkline';

export { Toggle } from './toggle';
export type { ToggleProps } from './toggle';

export { PageHead } from './page-head';
export type { PageHeadProps } from './page-head';

export { KPI } from './kpi';
export type { KpiDeltaKind, KpiProps } from './kpi';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

export { IncidentBanner } from './incident-banner';
export type { IncidentBannerProps } from './incident-banner';

export { Table } from './table';
export type { TableProps } from './table';

export { Tabs } from './tabs';
export type { TabItem, TabsProps } from './tabs';

export { FilterBar } from './filter-bar';
export type { FilterBarProps } from './filter-bar';

export { AdminTopBar } from './top-bar';
export type {
  AdminDensity,
  AdminEnv,
  AdminTheme,
  AdminTopBarProps,
} from './top-bar';

export { RowAction } from './row-action';
export type { RowActionProps } from './row-action';

export { Toolbar } from './toolbar';
export type { ToolbarProps } from './toolbar';

export { Kbd } from './kbd';
export type { KbdProps } from './kbd';

export { StatusPill } from './status-pill';
export type { ServerStatus, StatusPillProps } from './status-pill';
