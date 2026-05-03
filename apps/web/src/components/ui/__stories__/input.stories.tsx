// Storybook stub — F-UIKit `<Input>` variants.

import type { JSX } from 'react';
import { Input } from '../input';

export const Empty = (): JSX.Element => (
  <Input value="" onChange={() => undefined} placeholder="https://api.example.com/openapi.json" />
);
export const Filled = (): JSX.Element => (
  <Input value="https://stripe.com/api.json" onChange={() => undefined} />
);
export const Mono = (): JSX.Element => (
  <Input mono value="acid-23xxk" onChange={() => undefined} />
);
export const Disabled = (): JSX.Element => (
  <Input value="locked" onChange={() => undefined} disabled />
);

export default { title: 'ui/Input' };
