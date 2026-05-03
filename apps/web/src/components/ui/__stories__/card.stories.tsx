// Storybook stub — F-UIKit `<Card>` variants.

import type { JSX } from 'react';
import { Card } from '../card';

export const WithPadding = (): JSX.Element => <Card>padded body content.</Card>;
export const NoPadding = (): JSX.Element => (
  <Card padding={false}>tight body content.</Card>
);
export const ClickableHover = (): JSX.Element => (
  <Card onClick={() => undefined}>click anywhere on this card.</Card>
);

export default { title: 'ui/Card' };
