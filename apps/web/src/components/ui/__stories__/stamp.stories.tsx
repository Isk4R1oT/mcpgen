// Storybook stub — F-UIKit `<Stamp>` (canon double-bordered container).

import type { JSX } from 'react';
import { Stamp } from '../stamp';
import { Input } from '../input';

export const WithInput = (): JSX.Element => (
  <Stamp>
    <Input value="" onChange={() => undefined} placeholder="paste any openapi url" />
  </Stamp>
);
export const Empty = (): JSX.Element => <Stamp style={{ height: 64 }} />;

export default { title: 'ui/Stamp' };
