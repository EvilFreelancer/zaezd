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
In `replay` the reference "today" is the fixture's `recorded_at`, so a recorded event never
turns into a past event and reddens the suite on its own.
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

## What Gherkin does not cover

Two things belong elsewhere and putting them in a `.feature` breaks the rules above.

**Protocol and process limits.** Cache keys, TTLs, session re-initialization, concurrency
ceilings, `outputSchema` shapes, MIME profiles and byte-for-byte equality are not things a
traveller observes. They are unit and contract tests. The scenario states the observable
consequence instead: the same request answers the same way without touching the source.

**Anything that needs a browser.** Widths, horizontal scroll, keyboard focus, contrast, CSP
and the map are invisible to Cucumber on Node. They are covered by Playwright
in a real browser, and named in the feature only as an outcome the renderer produces.

No `@skip` and no `@wip` in committed specs. A scenario is red only while the task that
introduced it is in progress; a task is not done until every scenario is green.

## Use cases waiting to be specified

Written as `.feature` files when the matching layer is built, in this order. This list is
the acceptance surface of the product, derived from `specs/10-proverka.md` and
`specs/04-kompozitor.md`; keep it in sync as specs are written.

| File | Behaviour it owns |
|---|---|
| `stay-dates.feature` | a morning event pulls check-in one day earlier; the catalogue gives no end time, so a night is added; zero nights is a same-day trip without a hotel |
| `event-selection.feature` | an online event and an event in the origin city each produce their own "no trip" message; candidates are capped at five and only the first is computed |
| `feasibility.feature` | arriving later than one hour before the opening is flagged and cannot be the primary package; an unknown start time relaxes the check and says so |
| `trip-price.feature` | the total carries both legs plus the whole-stay hotel price; the hotel price is never multiplied by nights; a free-text price is shown and excluded; "от N" makes the total a lower bound |
| `hotel-choice.feature` | hotels rank by distance only when the venue was geocoded precisely, otherwise by price and rating with no distance shown |
| `three-packages.feature` | two rules picking one variant emit fewer cards, not duplicates; an over-budget result still renders with an overflow badge |
| `checkout-labels.feature` | a button is labelled from the `kind` Tutu actually returned; an unknown `kind` gets the most cautious label |
| `source-payloads.feature` | a field the source omitted stays missing all the way to the screen; a partial transport-mode failure never becomes "there is no such transport" |
| `recorded-sources.feature` | equivalent argument shapes (`["ai","data"]`, `"[\\"ai\\",\\"data\\"]"`, `"ai, data"`) resolve to one request; a repeated request returns the same answer without touching the source |
| `event-catalogue.feature` | a lost catalogue session recovers once and the answer still arrives; a catalogue outage is an error screen with a reason |
| `transport-and-stay.feature` | a transport outage assembles no package and says why; a hotel outage leaves packages without a hotel, labelled as such |
| `working-days.feature` | a night departure and a midday departure burn a different number of working days |
| `venue-location.feature` | a venue that could not be geocoded gets no precise marker and says so; walking time is absent rather than guessed |
| `weather-window.feature` | a date beyond the forecast window shows no weather block instead of history |
| `trip-assembly.feature` | the whole trip assembles from recordings; a failing optional source hides its block and leaves the trip intact |
| `checkout-links.feature` | a hotel link built without a room rate's `offerpack_hash` is not called a cart; a failed live call falls back to the search page, labelled honestly |
| `public-trip-link.feature` | a public link reopens the trip and says when it was computed; a corrupted, over-long or unknown-version identifier is refused with a readable reason |
| `trip-web-app.feature` | the public link opens on a computed trip, not a form; stages appear as they become ready |
| `trip-board.feature` | the card carries its six things and the arithmetic under the budget bar adds up; every empty state has its own text |
| `agent-tools.feature` | an agent gets the event, the packages and the coverage note; arguments in any of the three shapes are accepted |
| `trip-widget.feature` | the widget receives its result, recomputes through the host, and opens a checkout link outside |

## References

`.claude/rules/workflow.md`
`.claude/rules/testing.md`
`.claude/rules/composer-core.md`
