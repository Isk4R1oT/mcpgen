// apps/web/src/app/generate/[jobId]/canvas/page.tsx
//
// Canon CANVAS route — the post-generation tools editor. Reached as the
// terminal landing of the stream screen (see stream.tsx handleDone).
//
// Mirrors the canon flow:
//   landing -> /generate (paste) -> /generate/[jobId]/preview (REVIEW)
//     -> /generate/[jobId]/auth (AUTH) -> /generate/[jobId] (STREAM)
//     -> /generate/[jobId]/canvas (THIS PAGE)
//
// The Canvas component reads `partial_result.final_tools` via useJob and
// renders the canon 3-pane editor (TOOLS list left, detail middle,
// REFINEMENT CHAT right). The top-bar buttons:
//   k                  -> command palette
//   test               -> /generate/[jobId]/playground
//   share              -> share modal (canon static)
//   review & deploy    -> /generate/[jobId]/quality

import type { ReactElement } from 'react';

import { Canvas } from '@/components/screens/canvas/canvas';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ jobId: string }>;
}

export default async function CanvasPage({ params }: Params): Promise<ReactElement> {
  const { jobId } = await params;
  return <Canvas jobId={jobId} />;
}
