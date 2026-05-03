// apps/web/src/components/ui/index.ts
//
// Phase 0 / F-UIKit — barrel export for the canon primitive set.
// Phase 1+ screens consume `@/components/ui` for all production primitives.

export { Btn } from './btn';
export type { BtnKind, BtnProps, BtnSize } from './btn';

export { TopBar } from './top-bar';
export type { TopBarProps } from './top-bar';

export { Icon } from './icon';
export type { IconName, IconProps } from './icon';

export { Badge } from './badge';
export type { BadgeKind, BadgeProps } from './badge';

export { Card } from './card';
export type { CardProps } from './card';

export { Input } from './input';
export type { InputProps } from './input';

export { Stamp } from './stamp';
export type { StampProps } from './stamp';

export { SectionLabel } from './section-label';
export type { SectionLabelProps } from './section-label';

export { Switch, SwitchButton } from './switch-button';
export type { SwitchButtonProps } from './switch-button';
