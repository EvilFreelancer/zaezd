---
description: "Executable Gherkin specifications, layout, style, tags, offline by construction"
---

# Executable Gherkin specifications

`features/` holds the product contract. Every use case is written here in Gherkin
**before** the unit tests and **before** the implementation, and every scenario is
executable: `npm run bdd` runs them all.

## Layout

```
features/
├── <use-case>.feature        # Gherkin, business language
├── steps/<use-case>.steps.ts # thin translation layer, Given/When/Then
└── support/world.ts          # per-scenario state, hooks, fixture loading
```

One `.feature` per use case, named after the user-visible outcome
(`trip-from-topic.feature`, `stay-dates.feature`, `checkout-links.feature`), not after a
module. Step definitions may be shared across features; put reusable steps in the file
whose feature owns them and import nothing between step files.

## How a scenario is written

- **Business language only.** No HTTP verbs, no tool names, no function names, no CSS
  selectors inside a `.feature`. A step describes what a traveller or an agent observes.
  Bad: `When I call search_multitransport with origin Москва`.
  Good: `When the trip is assembled from Москва`.
- **Given** sets up recorded world state, **When** performs exactly one action,
  **Then** asserts one observable outcome. Chain with `And` rather than stuffing two
  actions into one `When`.
- **Scenario Outline** for rule tables. The date algorithm, the feasibility checks and the
  three package rules are naturally tabular and must be specified that way, so the spec
  itself becomes the readable statement of the algorithm.
- **Honesty scenarios are first-class.** Missing venue coordinates, a checkout link that is
  not a cart, an unparsed event price, a source that timed out: each is a specified
  behavior with its own scenario, not an edge case to be discovered later.
- Keep Gherkin keywords in English; the narrative inside a step may name Russian cities and
  events verbatim, because that is the real data.

## Rules for step definitions

- Steps are **thin**: translate the sentence into a call into `src/`, then assert.
  No business logic, no date arithmetic, no price arithmetic inside a step.
- Scenario state lives on the World (`features/support/world.ts`), never in module-level
  variables. Cucumber builds one World per scenario, which is what keeps scenarios isolated.
- Assertions use `node:assert/strict`.
- Ambiguous or duplicate step definitions are a hard error (`strict: true` in
  `cucumber.mjs`). Reuse an existing step instead of writing a near-copy.
- Run `npm run bdd` after adding a step to a feature; Cucumber prints a ready snippet for
  every undefined step (`snippetInterface: 'async-await'`).

## Offline by construction

Every scenario runs against recorded JSON in `fixtures/`, never against the live network.
This is not a preference: confcal and Tutu are slow and rate limited, `checkout_ref` and
`search_id` expire, and the demo must survive the venue network. Live calls belong to
`scripts/record.ts` and to manual smoke runs.

If a scenario cannot be expressed without the network, the fixture is missing. Record it.

## Tags

| Tag | Meaning |
|---|---|
| `@harness` | self-check of the tooling, must always be green |
| `@composer` | deterministic trip assembly |
| `@sources` | normalization of confcal and Tutu payloads |
| `@mcp` | the three outward tools and the `ui://` resource |
| `@web` | the trip board screen |
| `@checkout` | payment links and their honest labels |

No `@skip` and no `@wip` in committed specs. A scenario is red only while the task that
introduced it is in progress; a task is not done until every scenario is green.

## Use cases waiting to be specified

Written as `.feature` files when the matching layer is built, in this order. This list is
the acceptance surface of the product, derived from `specs/10-proverka.md` and
`specs/04-kompozitor.md`; keep it in sync as specs are written.

- [ ] Stay dates: morning event pulls check-in one day earlier; a late finish adds a night;
      unknown start time falls back to the cautious estimate; nights are never zero.
- [ ] Online event and event in the origin city produce no trip, each with its own message.
- [ ] A variant arriving later than one hour before the opening is flagged and cannot be
      the primary package.
- [ ] Total price contains both legs plus the whole-stay hotel price; a free-text event
      price is shown but excluded from the sum.
- [ ] Hotel price is never multiplied by the number of nights.
- [ ] Three packages collapse to fewer cards when two rules pick the same variant.
- [ ] Over-budget results still render, with an explicit overflow badge, never an empty screen.
- [ ] A venue that could not be geocoded gets no precise marker and says so.
- [ ] A partial transport-mode failure never becomes a claim that the mode does not exist.
- [ ] Checkout buttons are labelled from the actual `kind` returned by Tutu.
- [ ] A failing optional source hides its block and leaves the trip intact.
- [ ] Equivalent argument shapes (`["ai"]`, `"[\"ai\"]"`, `"ai, data"`) resolve to one
      request and one cache key.

## References

`.claude/rules/workflow.md`
`.claude/rules/testing.md`
`.claude/rules/composer-core.md`
