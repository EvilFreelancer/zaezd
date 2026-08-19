# Codex bridge for Cursor rules

This repository keeps detailed project rules in two trees. `.claude/rules/*.md` is the
source of truth and `.cursor/rules/*.mdc` is generated from it by `npm run rules:sync`;
`npm run rules:check` runs inside `npm run verify` and fails the build if they drift. Never
hand-edit a file under `.cursor/rules/`.

The bridge reads the generated Cursor tree, because that is where the `globs` frontmatter
Codex needs already lives. Codex does not read `.mdc` files on its own, so
`.codex/hooks/attach_rules.py` delivers them.

## How delivery works

| Trigger | What is attached |
|---------|------------------|
| `SessionStart` | every rule with `alwaysApply: true` |
| `PreToolUse` on `apply_patch` / `Edit` / `Write` | rules whose `globs` cover the files in the patch, once per rule per session |

The hook parses `.mdc` frontmatter (`description`, `globs`, `alwaysApply`) directly, so a
new rule file is picked up with no wiring. It fails open: a malformed rule exits quietly
instead of blocking an edit. Configuration lives in `.codex/hooks.json`.

Codex tracks hooks by content hash and skips untrusted ones without a hard error. Run
`/hooks` once per clone, and again after any edit to `attach_rules.py` or `hooks.json`.
Project-local hooks load only when the `.codex/` layer is trusted.

To see what a given patch would pull in, no Codex session needed:

```bash
echo '{"hook_event_name":"PreToolUse","session_id":"probe","tool_input":{"command":"*** Begin Patch\n*** Update File: src/composer/dates.ts\n*** End Patch"}}' | python3 .codex/hooks/attach_rules.py
```

## Rule index

Always-on rules carry `alwaysApply: true` and no `globs`; scoped rules carry `globs` and
`alwaysApply: false`, so the session-start payload stays small and the rest attaches to the
files being edited.

| Cursor rule | Applies to | Attachment |
|-------------|------------|------------|
| [workflow.mdc](../.cursor/rules/workflow.mdc) | Gherkin spec before tests before code, definition of done, Rules Sync | always |
| [bdd-specs.mdc](../.cursor/rules/bdd-specs.mdc) | Executable Gherkin specifications and step definitions | always |
| [architecture.mdc](../.cursor/rules/architecture.mdc) | Layers, dependency direction, fixed decisions | always |
| [code-style.mdc](../.cursor/rules/code-style.mdc) | TypeScript style, language policy, hygiene | always |
| [testing.mdc](../.cursor/rules/testing.mdc) | Vitest conventions, mandatory unit-test set | `tests/**/*.ts` |
| [implementation-order.mdc](../.cursor/rules/implementation-order.mdc) | Layer by layer build order | `src/**/*.ts` |
| [composer-core.mdc](../.cursor/rules/composer-core.mdc) | Dates, feasibility, price, packages | `src/composer/**/*.ts` |
| [data-sources.mdc](../.cursor/rules/data-sources.mdc) | confcal and Tutu clients, cache, degradation | `src/sources/**/*.ts`, `src/enrich/**/*.ts` |
| [mcp-layer.mdc](../.cursor/rules/mcp-layer.mdc) | Three outward tools, outputSchema, checkout labels | `src/mcp/**/*.ts` |
| [web-ui.mdc](../.cursor/rules/web-ui.mdc) | Trip board screen, states, Kite tokens | `src/web/**/*.{ts,html,css}` |

Codex caps model-visible hook output (roughly 2500 tokens by default; `additionalContextLimit`
in `hooks.json` raises it to 8000 at session start and 6000 per patch). Keep the always-on
set at these four.

## Operating rule

Keep `.cursor/rules/` as the single source of truth. The hook needs no update when rules
change, but this index and the `AGENTS.md` bridge section do: refresh both in the same
change that adds, renames, or removes a rule file. A rule is only reachable from Codex if
its frontmatter carries `globs` or `alwaysApply: true`.
