# Rule: testing

Tools: Vitest, fast-check, Playwright ([architecture.md §11](../../docs/architecture.md#11-testing)).

## What to test

| Change | Required tests |
|---|---|
| `packages/core` logic | Unit tests, written first; property tests for any invariant it touches |
| New policy strategy | Property tests that the shared invariants still hold under the strategy |
| Parser / grammar | Golden cases in `testdata/golden/` (input → expected JSON), including failures |
| API endpoint | Integration test against a real SQLite database and migrations |
| Migration | Test that it applies to the previous schema with data |
| Web view | Playwright at phone and desktop sizes, with accessibility checks |
| LLM prompt or schema | Eval set update; nightly eval must not regress |

## Rules

- Never skip, weaken or delete invariant or property tests to make a change pass.
- Tests are deterministic: inject the clock, timezone and random seeds.
  Property tests log their seed on failure.
- Tests make **no outbound network calls**. CI blocks external network for
  end-to-end tests.
- Fixtures, golden files and eval sets use synthetic data only. Real logs
  stay in `testdata/private/` (git-ignored) and never run in CI.
- Money in tests uses the same money utilities as production code; cover
  currencies with 0, 2 and 3 minor digits.
- A bug fix starts with a failing test that reproduces it.
