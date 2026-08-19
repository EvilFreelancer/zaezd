# Zaezd - agent brief

Trip engine that starts from a reason to travel. A person does not know where to go, they
know why. The first vertical is IT conferences: the event catalogue (confcal MCP) says
where and when, Tutu MCP supplies transport and lodging, and a deterministic composer turns
both into at most three explainable packages on one screen.

The product specification lives in [`specs/`](specs/README.md) and is authoritative. Read
[`specs/README.md`](specs/README.md) first; it indexes all ten documents and names the three
things that are never cut: the return leg, the deterministic date algorithm, and honest
checkout link labels.

## State of the repository

Specification and research are complete; the product code is being written layer by layer,
one feature per commit. Present now: the toolchain, the executable-specification harness,
the delivery scaffolding (CI, Docker, asset copy, rule-tree generator) and these rules.
`ideas/` and `research/` hold the reconnaissance the specs were built from and are not part
of the product; when the public repository is created they move to `docs/research/`.

## Commands

```bash
npm install          # once
npm start            # the server, ZAEZD_MODE=live or replay
npm run bdd          # executable Gherkin specifications (features/)
npm test             # unit tests (tests/)
npm run test:ui      # Playwright: widths, focus, contrast, no horizontal scroll
npm run typecheck    # tsc over the Node tree and the browser tree
npm run lint         # eslint
npm run rules:sync   # regenerate .cursor/rules from .claude/rules
npm run build        # compile to dist/ and copy static assets
npm run verify       # all of the above except test:ui and build, the gate before done
```

Runtime dependencies are added as the layer that needs them is built: `zod` with
`src/sources/normalize.ts`, `@modelcontextprotocol/sdk` with the clients,
`@modelcontextprotocol/ext-apps` with the `ui://` resource. Leaflet and the Kite token
extract are vendored under `src/web/public/vendor/` with their licences, not installed.
Unused dependencies are a scored defect here.

## How work is delivered

Specification first, then tests, then code. For any new behavior:

1. write the Gherkin scenario in `features/`;
2. add step definitions until it runs and fails for a real reason;
3. add failing unit tests for the pure rules it depends on;
4. implement from the innermost layer outward;
5. `npm run verify`, update the docs in the same change, sync the rule trees.

Details in `.cursor/rules/workflow.mdc` and `.claude/rules/workflow.md`.

## Layers

Dependencies point downward only.

| Layer | Location | Nature |
|---|---|---|
| L0 | `src/composer/{types,dates,selection,feasibility,pricing,hotels,packages,checkout-labels}.ts` | pure, deterministic, no I/O, no clock |
| L1 | `src/sources/` | confcal and Tutu clients, normalization, cache, replay |
| L2 | `src/enrich/` | production calendar, geocoding, weather, all optional |
| L3 | `src/composer/{build-trip,build-checkout,trip-id}.ts` | orchestration, budgets, live checkout, public link |
| L4 | `src/web/`, `src/mcp/` | delivery adapters, no business logic |

## Repository map

```
specs/      the product specification (authoritative)
features/   executable Gherkin specifications and step definitions
tests/      unit tests over the pure layer
src/        product code, by layer (see above)
fixtures/   recorded source payloads for specs, tests and replay mode
scripts/    record.ts and one-off tooling
docs/       user guide, architecture, decision log
ideas/      research, not part of the product
research/   raw probes and reviews, not part of the product
```

## Non-negotiables

- Nothing is invented. A field a source did not return is rendered as missing, never
  guessed. This is the product's promise, and it is also how Tutu's own instructions
  describe the biggest failure mode of travel agents.
- Dates, prices and feasibility are computed in code, never left to a model. Three
  identical live runs produced three different night counts and a 1.5x price spread.
- The hotel price is a whole-stay total and is never multiplied by nights.
- A checkout button is labelled from the `kind` Tutu actually returned.
- Specifications and tests run offline against `fixtures/`. The venue network is not a
  dependency. In `replay` the reference date is the fixture's `recorded_at`, so recorded
  events never turn into past events.
- Walking time comes from an OSRM foot profile or it is not shown. A car route relabelled
  "N мин пешком" is the same class of lie as an invented field.
- The web page and the `ui://` resource share one client renderer, never one finished
  document: the App receives its data from the host, not from us.
- Tool names are identical in code, README, user guide and diagrams:
  `find_event_trips`, `get_trip_details`, `create_trip_checkout`.

## Rules

| Rule | Scope |
|---|---|
| `workflow` | always |
| `bdd-specs` | always |
| `architecture` | always |
| `code-style` | always |
| `testing` | `tests/**/*.ts` |
| `implementation-order` | `src/**/*.ts` |
| `composer-core` | `src/composer/**/*.ts` |
| `data-sources` | `src/sources/**/*.ts`, `src/enrich/**/*.ts` |
| `mcp-layer` | `src/mcp/**/*.ts` |
| `web-ui` | `src/web/**/*.{ts,html,css}` |

Each rule exists twice, as `.claude/rules/<topic>.md` and `.cursor/rules/<topic>.mdc`.
`.claude/rules/` is the source of truth and the Cursor tree is generated from it by
`npm run rules:sync`; `npm run rules:check` runs inside `npm run verify` and fails the build
if the trees drift. Never hand-edit a file under `.cursor/rules/`. The Rules Sync section of
the `workflow` rule covers what the generator cannot do.

Codex reads the Cursor tree through the hook bridge in `.codex/`. Run `/hooks` in Codex once
per clone, and again after any edit to `.codex/hooks.json` or `.codex/hooks/attach_rules.py`,
otherwise the hook is silently skipped as untrusted.

## Language

Code, comments, rule files and this brief are written in English. Product copy and chat
replies are in Russian.
