// apps/web/src/providers/error-mode-shim.ts
//
// Mirrors the lightweight cross-screen error-mode hook + bus from canon
// `app.jsx:19-34`. Canon `screen-{stream,quality,deploy}.jsx` call
// `window.useErrorMode()` at function top — but `apps/web/src/lib/jsx-bridge/loader.ts`
// deliberately does NOT side-effect-import `@/app` (its top-level
// `ReactDOM.createRoot()` would fight Next's hydration root, per Pitfall 5).
//
// Without this shim every locked screen that consumes the hook crashes with
// `window.useErrorMode is not a function` on Next.js render. Reported by
// E2E-PIPELINE-alpha (deploy + quality) and -beta (also deploy).
//
// I-1 invariant respected: this file lives in the wiring layer (`providers/`),
// canon JSX is untouched. Idempotent registration — if `@/app` ever does
// load it will see the bus already populated and reuse it.

const g = globalThis as unknown as {
  React?: { useState: <T>(initial: T) => [T, (v: T) => void]; useEffect: (cb: () => (() => void) | void, deps: unknown[]) => void };
  MCPGEN_ERROR_BUS?: { value: string; listeners: Array<(v: string) => void> };
  useErrorMode?: () => [string, (v: string) => void];
};

if (g.MCPGEN_ERROR_BUS === undefined) {
  g.MCPGEN_ERROR_BUS = { value: 'none', listeners: [] };
}

if (g.useErrorMode === undefined) {
  g.useErrorMode = (): [string, (v: string) => void] => {
    if (g.React === undefined) {
      // Prior to React global registration — return a no-op pair so the
      // component still mounts. The next render after hydration will pick up
      // the real implementation.
      return ['none', (): void => {}];
    }
    const bus = g.MCPGEN_ERROR_BUS as { value: string; listeners: Array<(v: string) => void> };
    const [v, setV] = g.React.useState<string>(bus.value);
    g.React.useEffect((): (() => void) => {
      const fn = (val: string): void => setV(val);
      bus.listeners.push(fn);
      return (): void => {
        bus.listeners = bus.listeners.filter((l) => l !== fn);
      };
    }, []);
    const set = (val: string): void => {
      bus.value = val;
      bus.listeners.forEach((fn) => fn(val));
    };
    return [v, set];
  };
}
