// Storybook stub — F-UIKit `<Badge>` variants.

import type { JSX } from 'react';
import { Badge } from '../badge';

export const Default = (): JSX.Element => <Badge>v1</Badge>;
export const Primary = (): JSX.Element => <Badge kind="primary">primary</Badge>;
export const Soft = (): JSX.Element => <Badge kind="soft">soft</Badge>;
export const Warn = (): JSX.Element => <Badge kind="warn">warn</Badge>;
export const Success = (): JSX.Element => <Badge kind="success">success</Badge>;
export const Live = (): JSX.Element => <Badge kind="live">live</Badge>;
export const Accent = (): JSX.Element => <Badge kind="accent">accent</Badge>;
export const Ink = (): JSX.Element => <Badge kind="ink">ink</Badge>;
export const NonMono = (): JSX.Element => (
  <Badge kind="primary" mono={false}>
    no-mono
  </Badge>
);

export default { title: 'ui/Badge' };
