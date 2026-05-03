// Storybook stub — F-UIKit `<Icon>` set.

import type { JSX } from 'react';
import { Icon, type IconName } from '../icon';

const NAMES: IconName[] = [
  'arrow-r',
  'arrow-l',
  'check',
  'x',
  'plus',
  'spark',
  'cmd',
  'cloud',
  'doc',
  'box',
  'src',
  'play',
  'share',
  'caret-r',
  'caret-d',
  'bolt',
  'dot',
  'lock',
  'undo',
  'copy',
  'search',
  'warn',
  'bell',
];

export const AllIcons = (): JSX.Element => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 16 }}>
    {NAMES.map((n) => (
      <div key={n} style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>
        <Icon name={n} size={20} />
        <div>{n}</div>
      </div>
    ))}
  </div>
);

export const SizeMatrix = (): JSX.Element => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Icon name="spark" size={12} />
    <Icon name="spark" size={14} />
    <Icon name="spark" size={18} />
    <Icon name="spark" size={24} />
    <Icon name="spark" size={32} />
  </div>
);

export default { title: 'ui/Icon' };
