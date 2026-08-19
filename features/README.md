# Executable specifications

Every use case of Zaezd is described here in Gherkin **before** its unit tests and before
its implementation. `npm run bdd` runs all of them.

```bash
npm run bdd                          # everything
npx cucumber-js --tags '@composer'   # one area
npx cucumber-js features/stay-dates.feature
```

Step definitions are TypeScript, loaded by Node's native type stripping, so there is no
transpiler in the loop. That constrains the syntax: no `enum`, no `namespace`, no parameter
properties, and relative imports carry the `.ts` extension.

## Skeleton for a new use case

`features/<use-case>.feature`:

```gherkin
@composer
Feature: Stay dates follow the event, not the model

  The number of nights is decided by the algorithm in src/composer/dates.ts, so the same
  request always produces the same answer.

  Scenario Outline: Check-in day depends on the event start time
    Given a recorded event starting at <start> on 2026-10-29
    When the stay dates are computed
    Then the check-in day is <check_in>

    Examples:
      | start | check_in   |
      | 09:00 | 2026-10-28 |
      | 14:00 | 2026-10-29 |
      | none  | 2026-10-28 |
```

`features/steps/<use-case>.steps.ts`:

```ts
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { ZaezdWorld } from '../support/world.ts';

Given('a recorded event starting at {word} on {word}', function (this: ZaezdWorld, start: string, date: string) {
  // Arrange only. Load from fixtures/, store on the World, assert nothing here.
});
```

Steps stay thin: translate the sentence into a call into `src/`, then assert. No date or
price arithmetic inside a step definition, and no module-level mutable state - scenario
state belongs on the World in `support/world.ts`.

Full conventions, tags and the list of use cases still to be written are in the `bdd-specs`
rule (`.cursor/rules/bdd-specs.mdc`, `.claude/rules/bdd-specs.md`).
