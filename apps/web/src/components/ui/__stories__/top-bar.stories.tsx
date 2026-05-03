// Storybook stub — F-UIKit `<TopBar>` variants.

import type { JSX } from 'react';
import { TopBar } from '../top-bar';
import { Btn } from '../btn';

export const Default = (): JSX.Element => <TopBar />;
export const WithBreadcrumb = (): JSX.Element => <TopBar breadcrumb="dashboard" />;
export const WithRightSlot = (): JSX.Element => (
  <TopBar
    right={
      <Btn kind="ghost" size="sm" iconR="arrow-r">
        dashboard
      </Btn>
    }
  />
);
export const WithCanonCrumbAlias = (): JSX.Element => (
  <TopBar crumb="generate stripe-mcp" />
);

export default { title: 'ui/TopBar' };
