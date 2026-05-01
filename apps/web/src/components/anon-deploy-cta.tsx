// apps/web/src/components/anon-deploy-cta.tsx
//
// Plan 09.1-07 — Anon-aware deploy button. Replaces / augments the Deploy CTA
// with state-conditional copy and endpoint:
//
//   anon  → "Deploy to free 24h URL"  → POST /api/v1/deploy/ephemeral
//   authed → "Deploy to MCPGen Cloud"  → POST /api/v1/deploy/permanent/{id}
//
// CONTEXT D-08 endpoints. Locked CSS-vars only (FE-05 anti-drift).

'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';

import { useAnonState } from '@/lib/anon-state';

export interface AnonDeployCtaProps {
  readonly generationId: string;
}

interface EphemeralResponse {
  readonly url: string;
  readonly expires_at: string;
}

interface PermanentResponse {
  readonly server_name: string;
  readonly server_url: string;
}

type DeployResult =
  | { ok: true; mode: 'ephemeral'; data: EphemeralResponse }
  | { ok: true; mode: 'permanent'; data: PermanentResponse }
  | { ok: false; status: number; message: string };

async function deployEphemeral(generationId: string): Promise<DeployResult> {
  const res = await fetch('/api/v1/deploy/ephemeral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ generation_id: generationId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, message: text.length > 0 ? text : `Deploy failed (${res.status})` };
  }
  const data = (await res.json()) as EphemeralResponse;
  return { ok: true, mode: 'ephemeral', data };
}

async function deployPermanent(generationId: string): Promise<DeployResult> {
  const path = `/api/v1/deploy/permanent/${encodeURIComponent(generationId)}`;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, message: text.length > 0 ? text : `Deploy failed (${res.status})` };
  }
  const data = (await res.json()) as PermanentResponse;
  return { ok: true, mode: 'permanent', data };
}

export function AnonDeployCta({ generationId }: AnonDeployCtaProps): ReactElement | null {
  const { isAnonymous, loading } = useAnonState();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  if (loading) return null;

  const buttonText = isAnonymous ? 'Deploy to free 24h URL' : 'Deploy to MCPGen Cloud';

  const onClick = (): void => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        const r = isAnonymous ? await deployEphemeral(generationId) : await deployPermanent(generationId);
        if (r.ok) {
          setResult(r);
        } else {
          setError(r.message);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(`Network error: ${msg}`);
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <div
      data-testid="anon-deploy-cta"
      data-mode={isAnonymous ? 'ephemeral' : 'permanent'}
      className="mc-mono"
      style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <button
        type="button"
        className="mc-btn mc-btn-ink mc-btn-sm"
        onClick={onClick}
        disabled={submitting}
      >
        {submitting ? 'deploying…' : buttonText}
      </button>
      {result !== null && result.ok && result.mode === 'ephemeral' && (
        <span className="muted" style={{ fontSize: 12 }}>
          {result.data.url} (expires {result.data.expires_at})
        </span>
      )}
      {result !== null && result.ok && result.mode === 'permanent' && (
        <span className="muted" style={{ fontSize: 12 }}>
          {result.data.server_url}
        </span>
      )}
      {error !== null && (
        <span
          role="alert"
          style={{ color: 'var(--accent-red, var(--text))', fontSize: 12 }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
