// apps/web/src/app/_landing-client.tsx
//
// Plan 07-02 — Client wrapper for the landing route. Next.js 15 disallows
// `ssr: false` inside next/dynamic() when called from a Server Component;
// the call must live inside a 'use client' module. This is the indirection.
//
// Wires the canon Landing's navigation callbacks (header links, hero CTA,
// final-CTA strip) to the Next.js router. Without this wiring the canon
// `<a onClick={onMarketplace}>` etc. resolve to `undefined` and clicks are
// silent no-ops; the form's `onSubmit -> onMakeIt()` would also throw
// `TypeError: onMakeIt is not a function`. Reported by E2E-FINDINGS-agent-a
// (A-2, A-3, A-5).

'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import type { LockedSample } from '@/lib/jsx-bridge';

const LandingClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.LandingWrapper })),
  { ssr: false },
);

export default function LandingClientShell(): ReactElement {
  const router = useRouter();
  const [urlText, setUrlText] = useState<string>('');
  const [sample, setSample] = useState<LockedSample | undefined>(undefined);

  // The hero CTA forwards the typed URL to the canvas via query string so
  // the user doesn't have to retype it. Canvas reads `?spec_url=` (Wave-2
  // wiring); when absent the canvas falls back to its own input.
  const onMakeIt = (): void => {
    const trimmed = urlText.trim();
    const target =
      trimmed.length > 0 ? `/generate?spec_url=${encodeURIComponent(trimmed)}` : '/generate';
    router.push(target);
  };

  // exactOptionalPropertyTypes:true forbids passing `undefined` to an
  // optional prop. Spread the `sample` slot only when it has a value so
  // the prop is omitted (rather than explicitly undefined) on first render.
  const sampleSlot = sample !== undefined ? { sample } : {};

  return (
    <LandingClient
      {...sampleSlot}
      urlText={urlText}
      setUrlText={setUrlText}
      onSelectSample={(s: LockedSample): void => setSample(s)}
      onMakeIt={onMakeIt}
      onMarketplace={(): void => router.push('/marketplace')}
      onPricing={(): void => router.push('/pricing')}
      // `/api/auth/logto/sign-in` is a Next.js Route Handler that issues a
      // 307 to Logto Cloud. `router.push()` resolves it via RSC fetch which
      // can't follow cross-origin redirects, so the user stays on the page.
      // Use a full-page navigation so the browser follows the redirect chain
      // through to the Logto sign-in form.
      onSignIn={(): void => {
        window.location.assign('/api/auth/logto/sign-in');
      }}
    />
  );
}
