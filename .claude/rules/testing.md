---
description: "Vitest conventions and the mandatory unit-test set"
paths:
  - "tests/**/*.ts"
---

# Unit tests

Vitest, `tests/**/*.test.ts`. Unit tests protect the deterministic core; the observable
behavior of the product is protected by the Gherkin specs in `features/`
(see `.claude/rules/bdd-specs.md`). Write the spec first, the unit test second, the code third.

## Layout and naming

- File: `tests/<module>.test.ts`, mirroring the module under test.
- `describe('<module or function>')`, `it('<observable behavior>')`. The sentence in `it`
  reads as a fact: `it('pulls check-in one day earlier for a morning event')`.
- Arrange / Act / Assert, in that order, with a blank line between the blocks.
- One behavior per test. A test that asserts four unrelated things hides which one broke.

## What is unit tested

The pure layer, exhaustively. Everything in `src/composer/` that has no I/O, plus payload
normalization in `src/sources/` and the cache key builder.

The mandatory set, from `specs/08-repozitoriy.md`; each one is a real defect that has been
observed or is one payload away:

1. An online event builds no trip.
2. An empty or unrecognized `venue` yields no precise marker.
3. Check-in is one day before `start_date` for a morning event.
4. An event finishing late adds one more night.
5. Arrival after `starts_at` minus 60 minutes is flagged and cannot be the primary package.
6. The hotel price is not multiplied by the number of nights (`price_basis: "stay_total"`).
7. The total price includes both the outbound and the return leg.
8. A hotel `geo_id` is never taken from a transport response.
9. A hotel checkout built without `offerpack_hash` is not labelled a cart.
10. Equivalent argument shapes produce one cache key.
11. A partial transport-mode failure is not turned into "there is no such transport".
12. A free-text event price stays out of the sum.

## Rules

- **No network.** Load recorded payloads from `fixtures/` through the same reader the
  application uses. A test that needs a live source is misplaced: it belongs to a manual
  smoke run.
- **No wall clock.** Pure functions take the current date as an argument. Never call
  `Date.now()` or `new Date()` inside `src/composer/`; a test that depends on the day it
  runs will go red on its own.
- **Assert on values, not on shapes.** `expect(total).toBe(16980)` beats
  `expect(total).toBeGreaterThan(0)`.
- **Fixtures are typed on the way in.** A test asserts against the normalized domain type,
  not against raw Tutu JSON, so a change in their payload breaks one module and not fifty
  tests.

## Commands

```bash
npm test              # vitest run
npm run test:watch    # vitest, watch mode
npm run bdd           # executable Gherkin specs
npm run verify        # typecheck + lint + bdd + unit tests
```

`vitest.config.ts` keeps `passWithNoTests: true` so the pipeline is green on a fresh
checkout. Remove it once the suite is real, so an accidentally empty run cannot pass.

## References

`.claude/rules/bdd-specs.md`
`.claude/rules/composer-core.md`
`.claude/rules/code-style.md`
