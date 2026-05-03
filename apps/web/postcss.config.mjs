// Tailwind 4 PostCSS plugin — required so `@import "tailwindcss"` in
// `apps/web/src/styles/globals.css` actually emits the utility classes.
// Phase 0 F-Tokens authored globals.css with the import; this file wires the
// build step that consumes it. Without this, Tailwind utilities silently no-op
// in production bundles even though the import looks correct.
const config = {
  plugins: ['@tailwindcss/postcss'],
};

export default config;
