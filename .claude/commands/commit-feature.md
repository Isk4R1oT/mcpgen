# Commit Feature

Create a well-structured git commit for the completed work.

## Steps

1. Run `git status` and `git diff --stat` to review changes
2. Run tests to ensure everything passes:
   ```bash
   cd /Users/igor/Projects/mcpgen && python -m pytest -v
   ```
3. If tests fail — fix first, do not commit broken code
4. Stage relevant files (never stage .env or secrets):
   ```bash
   git add <specific files>
   ```
5. Write a descriptive commit message following conventional commits:
   - `feat: <description>` — new feature
   - `test: <description>` — tests only
   - `fix: <description>` — bug fix
   - `docs: <description>` — documentation
   - `refactor: <description>` — code refactoring
   - `chore: <description>` — tooling, config
6. Commit and push

## Rules

- One commit per logical unit of work
- Tests MUST pass before committing
- Never commit .env, API keys, or secrets
- Include Co-Authored-By in commit message
- Reference milestone in commit body if applicable (e.g., "Part of M1: Skeleton")
