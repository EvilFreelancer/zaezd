---
description: "BDD delivery order, Gherkin spec before tests before code, definition of done, Rules Sync"
---

# Workflow: specification first, then tests, then code

Zaezd is delivered BDD-style. The executable Gherkin specification is the contract,
the unit tests are the safety net, the implementation comes last. Tests and specs are
the long-term memory of this project: if a behavior is not described in
`features/**/*.feature`, it does not exist.

## New behavior (feature)

Triggered by "фича", "feature", "добавить", "implement", "add a use case".
**Do not skip a step and do not reorder them.**

1. **Write the Gherkin specification first.**
   Add or extend a `.feature` file under `features/`. Describe the observable outcome in
   business language, following `.claude/rules/bdd-specs.md`. This happens before any test file and
   before any production code.
2. **Make the specification executable.**
   Add the missing step definitions under `features/steps/`. Run `npm run bdd`.
   The scenario must now fail for a real reason (missing behavior), not because a step is
   undefined. A specification that cannot run is not a specification.
3. **Drop to unit tests for the pure logic.**
   For every deterministic rule the scenario depends on (dates, feasibility, pricing,
   package selection, normalization, cache keys) add a failing unit test under `tests/`,
   per `.claude/rules/testing.md`.
4. **Implement, lowest layer first.**
   Follow `.claude/rules/implementation-order.md` and `.claude/rules/architecture.md`. One unit at a time.
   Never write a higher layer before the layer under it is green.
5. **Green the unit tests, then the scenario.**
   `npm test`, then `npm run bdd`. In that order: a green scenario over red units means
   the units are undertested.
6. **Run the full gate.**
   `npm run verify` (rules check, typecheck of both the Node and the browser tree, lint,
   bdd, unit tests). Everything green, no exceptions.
7. **Update the documentation in the same change.**
   README, `docs/user-guide.md`, `docs/architecture.md`, `docs/decisions.md`.
   Never document a capability that does not exist in the code: the repository is graded
   by an AI reviewer that compares documentation against the code, and a mismatch costs
   more than a missing feature.
8. **Rules Sync** (see below).
9. **Report** using the structure below.

## Bug fix

Triggered by "баг", "bug", "ошибка", "fix", "исправить".

1. **Reproduce at the right altitude.** If a user or an agent can observe the bug, add a
   `Scenario` to the relevant `.feature` first, then a unit test if a pure rule is wrong.
   If the bug lives entirely inside a pure function, a unit test is enough.
2. **Confirm it is red for the stated reason.** Run the new scenario or test and read the
   failure. A test that passes before the fix proves nothing.
3. **Fix the code** in the lowest layer where the defect actually is, not where it surfaced.
4. **Green the new check, then `npm run verify`.**
5. **Update docs if behavior changed**, then Rules Sync, then report.

## Definition of done

A task is done only when all of these are true, verified by running them, not by assuming:

- `npm run verify` exits zero and the output is pasted into the report;
- every new behavior has a Gherkin scenario that runs offline against `fixtures/`;
- no `TODO`, no commented-out code, no stub that pretends to work;
- no capability is claimed in README or `docs/` that the code does not implement;
- rule trees are in sync.

## Report structure

```markdown
## Feature: <short description>

### Delivery
1. Specification `features/<name>.feature`, scenario "<name>" (red)
2. Step definitions `features/steps/<name>.steps.ts` (scenario now fails on missing behavior)
3. Unit tests `tests/<module>.test.ts` (red)
4. Implementation `src/<layer>/<module>.ts`
5. `npm test` - N passed; `npm run bdd` - M scenarios passed
6. `npm run verify` - green

### Changed files
- `src/...` - what and why
- `features/...`, `tests/...`
- `docs/...` - what was documented
- rule files synced (if any)
```

## Fixtures before network

Development and every automated check run against recorded JSON in `fixtures/`.
Live calls belong to `scripts/record.ts` and to manual smoke runs only. A specification or
a test that touches the network is broken by definition: the sources are rate limited,
slow (up to 6.3 s cold) and the venue Wi-Fi is not a dependency worth having.

## Rules Sync

**MANDATORY** - if any rule file is added or changed in this task, mirror the change to
every other agent's rule tree in the same commit. Do not leave one tree ahead of the other.

`.claude/rules/*.md` is the single source of truth. `.cursor/rules/*.mdc` is generated from
it, so the sync is a command, not a discipline:

```bash
npm run rules:sync    # rewrite the Cursor tree from the Claude tree
npm run rules:check   # fail if the Cursor tree is stale; runs inside npm run verify
```

The generator translates exactly two things, the frontmatter dialect
(Claude `paths: [...]` becomes Cursor `globs:` plus `alwaysApply: false`, and a rule with no
`paths:` becomes `alwaysApply: true`) and the way a rule cites a sibling
(`` `.claude/rules/file.md` `` becomes `@file.mdc`). Everything else is copied verbatim,
which is what keeps the two trees provably identical in substance.

The rest of the sync is still manual, because it is not mechanical:

1. Keep the language identical across trees. Rule files and `AGENTS.md` are written in
   **English**; chat replies stay in Russian.
2. If `AGENTS.md` changed, verify `CLAUDE.md` still resolves to it
   (`ls -la CLAUDE.md` shows `CLAUDE.md -> AGENTS.md`; restore with `ln -sf AGENTS.md CLAUDE.md`).
3. If a rule file was added, renamed or removed, refresh the index in `.codex/rules.md`.
   The hook itself (`.codex/hooks.json`, `.codex/hooks/attach_rules.py`) reads
   `.cursor/rules/` directly and needs no update.
4. Check the other agent roots that may appear later (`.github/copilot-instructions.md`,
   `.opencode/`) and mirror there by hand.
5. Commit both sides together and list every synced file in the report.

Never hand-edit a file under `.cursor/rules/`. The next `npm run rules:sync` overwrites it,
and `npm run rules:check` will have failed the build before that anyway.

## References

`.claude/rules/bdd-specs.md`
`.claude/rules/testing.md`
`.claude/rules/architecture.md`
`.claude/rules/implementation-order.md`
