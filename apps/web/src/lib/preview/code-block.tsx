// apps/web/src/lib/preview/code-block.tsx
//
// Plan 07-04 — SSR-friendly syntax-highlighted code block backed by shiki@^4.
//
// This is a React Server Component (no 'use client' directive). `codeToHtml`
// runs at build/request time on the server; the bundler never includes shiki
// in the client chunk, so the FE-03 transparency principle (full Stage E
// TypeScript bundle visible in preview) ships with zero client JS overhead
// from the highlighter.
//
// FE-05 visual-lock: the rendered HTML is emitted via dangerouslySetInnerHTML
// inside a wrapper styled with locked CSS-vars only (var(--paper-alt),
// var(--border), var(--radius), var(--font-mono)). No new visual elements;
// the wrapper sits adjacent to the locked Preview screen, NOT inside it
// (the locked screen-preview.jsx has no code-panel slot — verified at Task 1).
//
// Trust: the input `code` is server-controlled (Stage E codegen output stored
// in R2 and served back via the BFF). No user-supplied content reaches Shiki
// (T-7-13 disposition: accept; controlled-input rationale). React 19 does NOT
// auto-escape inside dangerouslySetInnerHTML, but Shiki emits the HTML it
// builds itself from the deterministic codegen output — no XSS surface.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples" Shiki Server Component
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-23
//   - https://shiki.style/guide/install#cjs-usage (codeToHtml)

import { codeToHtml, type BundledLanguage } from 'shiki';
import type { ReactElement } from 'react';

export interface CodeBlockProps {
  code: string;
  lang: BundledLanguage;
}

/**
 * Renders a syntax-highlighted code block using Shiki's `codeToHtml`.
 *
 * Server Component: must be awaited by the consumer. Runs at request time on
 * the Next.js server; the highlighter never ships to the browser bundle.
 *
 * Style strategy: a single wrapper div with locked-CSS-var inline styles. Shiki
 * emits `<pre class="shiki ..."><code>...</code></pre>` with its own theme
 * tokens; we override the outer container so the panel sits inside the locked
 * Preview screen visual without introducing new classes / colors / spacing.
 */
export async function CodeBlock({ code, lang }: CodeBlockProps): Promise<ReactElement> {
  const html = await codeToHtml(code, {
    lang,
    theme: 'github-dark',
  });

  return (
    <div
      className="mc-code-panel mc-mono"
      style={{
        // Locked CSS-vars only — see global.css. NO new design tokens.
        background: 'var(--paper-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 22px',
        marginTop: 24,
        overflow: 'auto',
        maxHeight: 720,
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
