# Test-Driven Development Workflow

Write tests FIRST, then implement the code to make them pass.

## Steps

1. **Understand** the feature/module requirements
2. **Write tests** in `tests/` that cover:
   - Happy path (expected behavior)
   - Edge cases (empty input, invalid data, missing fields)
   - Error cases (network failures, invalid API responses)
3. **Run tests** — verify they FAIL (red phase)
   ```bash
   cd /Users/igor/Projects/mcpgen && python -m pytest tests/test_<module>.py -v
   ```
4. **Implement** the minimum code to make tests pass
5. **Run tests** again — verify they PASS (green phase)
6. **Refactor** if needed, keeping tests green

## For AI Agent tests (deepeval)

Use deepeval with LLM-as-judge for testing PydanticAI agent outputs:

```bash
cd /Users/igor/Projects/mcpgen && python -m pytest tests/test_<agent>.py -v
```

Agent tests should verify:
- Structured output matches expected Pydantic model
- Generated tool descriptions are meaningful (LLM judge)
- Generated code is syntactically valid
- Auth handling is correct

## Rules

- Every new module in `backend/` MUST have a corresponding `tests/test_<module>.py`
- Test files are created BEFORE implementation files
- Never skip failing tests — fix the code
- Minimum coverage: all public functions tested
- Use fixtures in `tests/fixtures/` for sample data (petstore.yaml, etc.)
