import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { choosePackages, type PackageNote, type PackagesResult, type TripVariant } from '../../src/composer/packages.ts';
import { parseEventPrice, priceTrip } from '../../src/composer/pricing.ts';
import { checkFeasibility } from '../../src/composer/feasibility.ts';
import type { ZaezdWorld } from '../support/world.ts';

const OPENS_AT = '2026-08-27T10:00:00+03:00';
const EVENT = { startDate: '2026-08-27', endDate: '2026-08-29', startsAt: OPENS_AT };

type Draft = {
  readonly id: string;
  readonly total: number;
  readonly durationMin: number;
  readonly workingDays?: number;
  readonly makesTheOpening: boolean;
};

function drafts(world: ZaezdWorld): Draft[] {
  return world.scratch.has('drafts') ? world.recall<Draft[]>('drafts') : [];
}

function addDraft(world: ZaezdWorld, draft: Draft): void {
  world.remember('drafts', [...drafts(world), draft]);
}

/** The whole cost sits on the outbound leg; this feature is about choosing, not about pricing. */
function toVariant(draft: Draft, budget?: number): TripVariant {
  return {
    id: draft.id,
    cost: priceTrip({
      outbound: { amount: draft.total, currency: 'RUB' },
      back: { amount: 0, currency: 'RUB' },
      nights: 0,
      eventPrice: parseEventPrice(undefined),
      ...(budget === undefined ? {} : { budget }),
    }),
    feasibility: checkFeasibility({
      event: EVENT,
      arrivalAt: draft.makesTheOpening ? '2026-08-26T18:00:00+03:00' : '2026-08-27T11:00:00+03:00',
    }),
    totalDurationMin: draft.durationMin,
    ...(draft.workingDays === undefined ? {} : { workingDaysBurnt: draft.workingDays }),
  };
}

Given(
  /^a trip "(.+)" costing ([\d.]+) ₽, (\d+) minutes on the road, burning (\d+) working days?$/,
  function (this: ZaezdWorld, id: string, total: string, durationMin: string, workingDays: string) {
    addDraft(this, {
      id,
      total: Number(total),
      durationMin: Number(durationMin),
      workingDays: Number(workingDays),
      makesTheOpening: true,
    });
  },
);

Given(
  'a trip {string} costing {float} ₽, {int} minutes on the road, with no working-day count',
  function (this: ZaezdWorld, id: string, total: number, durationMin: number) {
    addDraft(this, { id, total, durationMin, makesTheOpening: true });
  },
);

Given('{string} does not make the opening', function (this: ZaezdWorld, id: string) {
  this.remember(
    'drafts',
    drafts(this).map((draft) => (draft.id === id ? { ...draft, makesTheOpening: false } : draft)),
  );
});

Given('there are no trips to choose from', function (this: ZaezdWorld) {
  this.remember('drafts', []);
});

function chooseFrom(world: ZaezdWorld, list: readonly Draft[]): PackagesResult {
  const input = world.scratch.has('cost-input')
    ? world.recall<{ budget?: number }>('cost-input')
    : {};
  const budget = input.budget;
  return choosePackages(list.map((draft) => toVariant(draft, budget)));
}

When('the packages are chosen', function (this: ZaezdWorld) {
  this.remember('packages', chooseFrom(this, drafts(this)));
});

When(
  'the packages are chosen, and chosen again in the opposite order',
  function (this: ZaezdWorld) {
    const list = drafts(this);
    this.remember('both', [chooseFrom(this, list), chooseFrom(this, [...list].reverse())]);
    this.remember('packages', chooseFrom(this, list));
  },
);

function result(world: ZaezdWorld): PackagesResult {
  return world.recall<PackagesResult>('packages');
}

function ruleHolder(world: ZaezdWorld, rule: string): string | undefined {
  return result(world).packages.find((entry) => entry.rules.includes(rule as never))?.variant.id;
}

Then('there are {int} packages', function (this: ZaezdWorld, count: number) {
  assert.equal(result(this).packages.length, count);
});

Then('there is {int} package', function (this: ZaezdWorld, count: number) {
  assert.equal(result(this).packages.length, count);
});

Then('the cheapest package is {string}', function (this: ZaezdWorld, id: string) {
  assert.equal(ruleHolder(this, 'cheapest'), id);
});

Then('the package that saves leave is {string}', function (this: ZaezdWorld, id: string) {
  assert.equal(ruleHolder(this, 'no-leave'), id);
});

Then('the fastest package is {string}', function (this: ZaezdWorld, id: string) {
  assert.equal(ruleHolder(this, 'fastest'), id);
});

Then('no package claims to save leave', function (this: ZaezdWorld) {
  assert.equal(ruleHolder(this, 'no-leave'), undefined);
});

Then(
  'the card for {string} says it is both the cheapest and the fastest',
  function (this: ZaezdWorld, id: string) {
    const card = result(this).packages.find((entry) => entry.variant.id === id);
    assert.deepEqual(card?.rules, ['cheapest', 'fastest']);
  },
);

const WARNINGS: Readonly<Record<string, PackageNote>> = {
  'nothing makes the opening': 'no-feasible-variant',
  'nothing fits the budget': 'over-budget',
  'the working days could not be counted': 'no-working-day-data',
};

Then(/^the answer warns that (.+)$/, function (this: ZaezdWorld, phrase: string) {
  const note = WARNINGS[phrase];
  assert.ok(note !== undefined, `the feature used a warning nobody mapped: "${phrase}"`);
  assert.ok(result(this).notes.includes(note));
});

Then('both answers are the same', function (this: ZaezdWorld) {
  const [first, second] = this.recall<PackagesResult[]>('both');
  assert.deepEqual(second, first);
});
