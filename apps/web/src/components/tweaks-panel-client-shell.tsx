// apps/web/src/components/tweaks-panel-client-shell.tsx
//
// Client-only shell that loads the locked /src/tweaks-panel.jsx side-effect
// module (which assigns `TweaksPanel` and friends onto `window`) and renders
// the registered `window.TweaksPanel` component.
//
// Mounted by `apps/web/src/app/layout.tsx` ONLY when the
// `ui_tweaks_panel_perm` flag is true (see REQ-002). When the flag is
// false the layout renders no node at all — there is no SSR fallback.
//
// The locked module is unchanged (no shell logic added there); this wrapper
// is the contract-compliant way to surface dev-tooling without violating
// CLAUDE.md §12 rule 15 (locked artifacts).

'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

// Side-effect import — registers `window.TweaksPanel` etc.
import '@/tweaks-panel.jsx';

interface WindowWithTweaks extends Window {
  TweaksPanel?: (props: { children?: React.ReactNode }) => ReactElement;
}

export default function TweaksPanelClientShell(): ReactElement | null {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as WindowWithTweaks;
    if (typeof w.TweaksPanel === 'function') setReady(true);
  }, []);

  if (!ready) return null;
  const w = window as WindowWithTweaks;
  if (typeof w.TweaksPanel !== 'function') return null;
  const Panel = w.TweaksPanel;
  return <Panel />;
}
