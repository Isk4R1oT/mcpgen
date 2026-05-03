// apps/web/src/providers/nav-shim.tsx
//
// Phase M-4-INFRA — Foundation for new UI canon.
//
// Purpose: bridge the locked .jsx canon's standalone-SPA navigation
// model (window.app.navigate(name, params)) onto Next.js App Router.
//
// The original app.jsx kept all routing in React.useState (see
// `setScreen('canvas')` etc.), so screens and ux-glue.jsx were written
// to call `window.app.navigate('canvas')` for transitions. In the
// Next.js wire-up, each canonical screen-name maps to a real URL
// (per task brief):
//
//     'landing'        → /
//     'auth'           → /auth                   (composite below)
//     'canvas'         → /generate
//     'stream'         → /generate/{jobId}/stream
//     'preview'        → /generate/{jobId}/preview
//     'quality'        → /generate/{jobId}/quality
//     'playground'     → /generate/{jobId}/playground
//     'deploy'         → /generate/{jobId}/deploy
//     'dashboard'      → /dashboard/{id}
//     'dashboard-list' → /dashboard
//     'billing'        → /billing
//     'marketplace'    → /marketplace            (flag-gated)
//     'server-detail'  → /marketplace/{serverId} (flag-gated)
//     'admin'          → /admin                  (flag-gated; * subroutes
//                                                  open under /admin/<sub>)
//
// Wave-2 agents that own each screen pass real callbacks (onMakeIt,
// onContinue, etc.) directly via props — preferred per the rebuild
// contract §6.2. This shim is the safety net for canon code paths
// that still reference window.app at runtime (for example dashboard
// drawer body components in ux-glue.jsx that nav cross-screen).

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';

// ----------------------------------------------------------------------
// Screen-name → path mapping
// ----------------------------------------------------------------------

interface NavParams {
  jobId?: string;
  id?: string;
  serverId?: string;
  sub?: string;
}

const STATIC_ROUTES: Readonly<Record<string, string>> = {
  landing: '/',
  auth: '/auth',
  canvas: '/generate',
  'dashboard-list': '/dashboard',
  billing: '/billing',
  marketplace: '/marketplace',
  admin: '/admin',
};

/**
 * Pure helper exported for tests. Resolves a (screen-name, params) pair
 * to a Next.js path. Unknown screens fall back to '/' so legacy callers
 * never crash the app.
 */
export function resolveScreenPath(name: string, params: NavParams): string {
  switch (name) {
    case 'stream':
      return params.jobId !== undefined ? `/generate/${params.jobId}/stream` : '/generate';
    case 'preview':
      return params.jobId !== undefined ? `/generate/${params.jobId}/preview` : '/generate';
    case 'quality':
      return params.jobId !== undefined ? `/generate/${params.jobId}/quality` : '/generate';
    case 'playground':
      return params.jobId !== undefined ? `/generate/${params.jobId}/playground` : '/generate';
    case 'deploy':
      return params.jobId !== undefined ? `/generate/${params.jobId}/deploy` : '/generate';
    case 'dashboard':
      return params.id !== undefined ? `/dashboard/${params.id}` : '/dashboard';
    case 'server-detail':
      return params.serverId !== undefined ? `/marketplace/${params.serverId}` : '/marketplace';
    case 'admin':
      return params.sub !== undefined ? `/admin/${params.sub}` : '/admin';
    default: {
      const route = STATIC_ROUTES[name];
      return route ?? '/';
    }
  }
}

// ----------------------------------------------------------------------
// Window globals shape
// ----------------------------------------------------------------------

interface AppShim {
  navigate: (name: string, params?: NavParams) => void;
}

interface WindowShim {
  app?: AppShim;
  mcpToast?: (msg: string, opts?: { kind?: string; icon?: string }) => void;
  mcpDrawer?: (
    title: string,
    body: ReactNode,
    opts?: { eyebrow?: string },
  ) => void;
}

// ----------------------------------------------------------------------
// Provider component
// ----------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

/**
 * Mounts a no-op-but-safe set of `window.*` globals that the locked
 * canon (screen-*.jsx + ux-glue.jsx) calls at runtime. Wave-2 agents
 * may layer richer toast/drawer hosts on top, but the defaults here
 * guarantee no `window.X is not a function` crashes from canon code
 * that hasn't been wired yet.
 */
export default function NavShim({ children }: Props): ReactElement {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & WindowShim;

    // Idempotent: only set our shim if no real implementation exists.
    if (w.app === undefined) {
      w.app = {
        navigate: (name: string, params: NavParams = {}): void => {
          const path = resolveScreenPath(name, params);
          // useRouter().push is the App Router-aware client navigate.
          router.push(path);
        },
      };
    }

    if (typeof w.mcpToast !== 'function') {
      // Minimal console fallback. Wave-2 may replace with a real
      // ToastHost that subscribes via window._mcpRegister (see
      // ux-glue.jsx). Console.info keeps the canon's "no dead button"
      // contract observable in dev.
      w.mcpToast = (msg: string): void => {
        // eslint-disable-next-line no-console
        console.info('[mcp-toast]', msg);
      };
    }

    if (typeof w.mcpDrawer !== 'function') {
      w.mcpDrawer = (title: string): void => {
        // eslint-disable-next-line no-console
        console.info('[mcp-drawer]', title);
      };
    }
  }, [router]);

  return <>{children}</>;
}
