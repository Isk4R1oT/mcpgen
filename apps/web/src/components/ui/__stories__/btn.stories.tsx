// Storybook stub — F-UIKit `<Btn>` variants.
// No Storybook setup exists yet; this file documents the visual matrix for
// future use. Each named export = one canon-spec variant.

import type { JSX } from 'react';
import { Btn } from '../btn';

export const Primary = (): JSX.Element => <Btn kind="primary">primary</Btn>;
export const Ink = (): JSX.Element => <Btn kind="ink">ink</Btn>;
export const Ghost = (): JSX.Element => <Btn kind="ghost">ghost</Btn>;
export const Soft = (): JSX.Element => <Btn kind="soft">soft</Btn>;
export const Danger = (): JSX.Element => <Btn kind="danger">danger</Btn>;
export const Link = (): JSX.Element => <Btn kind="link">link</Btn>;
export const Small = (): JSX.Element => (
  <Btn kind="primary" size="sm">
    sm
  </Btn>
);
export const Medium = (): JSX.Element => (
  <Btn kind="primary" size="md">
    md
  </Btn>
);
export const Large = (): JSX.Element => (
  <Btn kind="primary" size="lg">
    lg
  </Btn>
);
export const WithLeftIcon = (): JSX.Element => (
  <Btn kind="primary" icon="spark">
    generate
  </Btn>
);
export const WithRightIcon = (): JSX.Element => (
  <Btn kind="ghost" iconR="arrow-r">
    next
  </Btn>
);
export const FullWidth = (): JSX.Element => (
  <Btn kind="primary" full>
    deploy
  </Btn>
);
export const Disabled = (): JSX.Element => (
  <Btn kind="primary" disabled>
    disabled
  </Btn>
);

export default { title: 'ui/Btn' };
