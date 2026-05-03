// Storybook stub — F-UIKit `<SwitchButton>` (canon `adm-toggle`).

import type { JSX } from 'react';
import { useState } from 'react';
import { SwitchButton } from '../switch-button';

export const Off = (): JSX.Element => (
  <SwitchButton checked={false} onChange={() => undefined} label="dark mode" />
);
export const On = (): JSX.Element => (
  <SwitchButton checked onChange={() => undefined} label="dark mode" />
);
export const Disabled = (): JSX.Element => (
  <SwitchButton checked={false} onChange={() => undefined} label="locked" disabled />
);
export const Interactive = (): JSX.Element => {
  const [on, setOn] = useState(false);
  return <SwitchButton checked={on} onChange={setOn} label="auto-deploy" />;
};

export default { title: 'ui/SwitchButton' };
