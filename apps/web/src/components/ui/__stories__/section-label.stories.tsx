// Storybook stub — F-UIKit `<SectionLabel>` variants.

import type { JSX } from 'react';
import { SectionLabel } from '../section-label';

export const Caption = (): JSX.Element => <SectionLabel>spec</SectionLabel>;
export const RowWithRight = (): JSX.Element => (
  <SectionLabel right={<span>v1</span>}>tools</SectionLabel>
);

export default { title: 'ui/SectionLabel' };
