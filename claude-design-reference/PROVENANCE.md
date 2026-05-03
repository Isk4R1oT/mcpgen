# Canon Provenance

Canon source: /Users/igor/Downloads/MCPGen(5)/
Synced: 2026-05-04

This directory is an **immutable read-only mirror** of the user's authoritative
canon design. Do not edit. Production TSX implementations live under
`apps/web/src/components/screens/` and must achieve 1:1 visual + UX parity.

## Sync history
- 2026-05-02 — initial sync from MCPGen(3) (40 files, 13 main screens + 18 admin)
- 2026-05-04 — sync to MCPGen(5)
  - app.jsx — updated (screen list now includes 'account' and 'settings')
  - screen-auth.jsx — refined (auth-detection screen, unchanged scope)
  - screen-dashboard-list.jsx — updated
  - screen-account.jsx — NEW (sign-in / sign-up / magic / forgot)
  - screen-settings.jsx — NEW (1351 lines · 9 sections · scroll-spy sidebar)
  - MCPGen.html — updated script list

See `MANIFEST.txt` for SHA-256 of every file.
