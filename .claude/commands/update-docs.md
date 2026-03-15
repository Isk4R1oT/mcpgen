# Update Project Documentation

Review all recent changes and update documentation in the `docs/` folder accordingly.

## Steps

1. Check `git diff` and `git log` for recent changes since last docs update
2. For each changed module, update the relevant doc file:
   - `docs/architecture.md` — system overview, component diagram, data flow
   - `docs/api.md` — FastAPI endpoints, request/response schemas
   - `docs/database.md` — Supabase tables, relationships, storage buckets
   - `docs/pipeline.md` — AI pipeline stages, agent models, code generation flow
   - `docs/deployment.md` — Docker, environment variables, deployment instructions
3. Ensure docs reflect current state of code, not historical changes
4. Keep docs concise — link to source files rather than duplicating code
5. Update `docs/README.md` index if new doc files were added

## Rules

- Documentation language: English
- Use mermaid diagrams for architecture and flow visualization
- Reference file paths as `backend/pipeline/orchestrator.py:42` format
- Do not duplicate what is already in docstrings — link instead
- Keep each doc file focused on one topic
