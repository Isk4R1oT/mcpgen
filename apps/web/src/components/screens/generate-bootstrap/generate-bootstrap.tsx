'use client';

// apps/web/src/components/screens/generate-bootstrap/generate-bootstrap.tsx
//
// Tiny bridge screen that POSTs /api/v1/generate and redirects to
// /generate/[jobId]/preview. Replaces the previous "render full Canvas
// while submitting" approach which flashed the post-gen tools editor for
// ~3-4 seconds and confused users (canvas chrome, refinement chat, "0
// tools" empty state) before the redirect to PREVIEW fired.
//
// Canon flow per claude-design-reference/canon/: paste -> REVIEW -> AUTH
// -> STREAM -> CANVAS. Canvas should NEVER render before the pipeline
// has data; this component is the brief no-chrome interstitial that
// covers the POST round-trip (~200-500ms).

import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactElement } from 'react';

import { submitGeneration } from '@/lib/api/generate';
import { toast } from '@/lib/toast';

// FNV-1a 32-bit hash for the idempotency-bucket spec URL — mirrors the
// helper in canvas.tsx (intentionally duplicated; both call sites are
// independent entry points and a shared module would create a circular
// import path through the canvas chrome).
function hashSpecUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface GenerateBootstrapProps {
  readonly specUrl: string;
}

export function GenerateBootstrap({ specUrl }: GenerateBootstrapProps): ReactElement {
  const router = useRouter();
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    let parsed: URL;
    try {
      parsed = new URL(specUrl);
    } catch {
      toast('that does not look like a valid url', { kind: 'error' });
      router.replace('/');
      return;
    }

    void (async (): Promise<void> => {
      const url = parsed.toString();
      const result = await submitGeneration({
        specUrl: url,
        specHash: hashSpecUrl(url),
        request: { spec_url: url },
      });
      if (!result.ok) {
        toast(result.error, { kind: 'error' });
        router.replace('/');
        return;
      }
      // router.replace (not push) so the browser back button doesn't
      // resurrect this transient "creating…" screen.
      router.replace(`/generate/${encodeURIComponent(result.data.job_id)}/preview`);
    })();
  }, [router, specUrl]);

  return (
    <main
      className="mc-page"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div className="mc-mono" style={{ opacity: 0.6, fontSize: 13 }}>
        STEP 00 · STARTING
      </div>
      <div
        className="mc-display-l"
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
      >
        creating your server…
      </div>
      <div className="mc-mono" style={{ opacity: 0.5, fontSize: 13 }}>
        warming up the engine.
      </div>
    </main>
  );
}
