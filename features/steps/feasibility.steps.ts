import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { checkFeasibility, type Feasibility } from '../../src/composer/feasibility.ts';
import type { CatalogueEvent, IsoDateTime } from '../../src/composer/types.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

type EventTiming = {
  startDate: string;
  endDate: string;
  startsAt?: IsoDateTime;
};

type RecordedVariant = {
  readonly transport: string;
  readonly departure_at: string;
  readonly arrival_at: string;
  readonly price: { readonly amount: number };
};

function timing(world: ZaezdWorld): EventTiming {
  return world.recall<EventTiming>('timing');
}

Given('the event opens at {word}', function (this: ZaezdWorld, startsAt: string) {
  this.remember('timing', {
    startDate: startsAt.slice(0, 10),
    endDate: startsAt.slice(0, 10),
    startsAt,
  });
});

Given('the event opening time is unknown', function (this: ZaezdWorld) {
  this.remember('timing', { startDate: '2026-08-27', endDate: '2026-08-27' });
});

Given('the event runs from {word} to {word}', function (this: ZaezdWorld, from: string, to: string) {
  this.remember('timing', { startDate: from, endDate: to });
});

Given('the event is {string}', function (this: ZaezdWorld, title: string) {
  const event = this.recall<CatalogueEvent[]>('events').find((item) => item.title === title);
  assert.ok(event !== undefined, `the recorded catalogue has no event titled "${title}"`);

  this.remember('timing', {
    startDate: event.startDate,
    endDate: event.endDate,
    ...(event.startsAt === undefined ? {} : { startsAt: event.startsAt }),
  });
});

const RECORDED_JOURNEYS: Readonly<Record<string, string>> = {
  'Москва->Екатеринбург': 'tutu/multitransport-msk-ekb-out.json',
  'Екатеринбург->Москва': 'tutu/multitransport-ekb-msk-back.json',
};

Given(
  'the recorded journeys from {word} to {word}',
  function (this: ZaezdWorld, from: string, to: string) {
    const fixture = RECORDED_JOURNEYS[`${from}->${to}`];
    assert.ok(fixture !== undefined, `no recorded journeys from ${from} to ${to}`);

    this.remember('variants', loadPayload<{ variants: RecordedVariant[] }>(fixture).variants);
  },
);

When('the traveller arrives at {word}', function (this: ZaezdWorld, arrivalAt: string) {
  this.remember('feasibility', checkFeasibility({ event: timing(this), arrivalAt }));
});

When('the journey home leaves at {word}', function (this: ZaezdWorld, departureAt: string) {
  this.remember('feasibility', checkFeasibility({ event: timing(this), returnDepartureAt: departureAt }));
});

When('the cheapest recorded train is checked', function (this: ZaezdWorld) {
  const trains = this.recall<RecordedVariant[]>('variants').filter(
    (variant) => variant.transport === 'railway',
  );
  const cheapest = trains.reduce((best, variant) =>
    variant.price.amount < best.price.amount ? variant : best,
  );
  this.remember('feasibility', checkFeasibility({ event: timing(this), arrivalAt: cheapest.arrival_at }));
});

function result(world: ZaezdWorld): Feasibility {
  return world.recall<Feasibility>('feasibility');
}

Then('the trip {word} the opening', function (this: ZaezdWorld, verdict: string) {
  assert.equal(result(this).makesTheOpening, verdict === 'makes');
});

Then('the margin before the opening is {int} minutes', function (this: ZaezdWorld, minutes: number) {
  assert.equal(result(this).marginMinutes, minutes);
});

Then('the variant cannot be offered as the main trip', function (this: ZaezdWorld) {
  assert.equal(result(this).canBePrimary, false);
});

Then('the variant can be offered as the main trip', function (this: ZaezdWorld) {
  assert.equal(result(this).canBePrimary, true);
});

Then('the trip cannot say whether it makes the opening', function (this: ZaezdWorld) {
  assert.equal(result(this).makesTheOpening, undefined);
});

Then('the trip leaves too early', function (this: ZaezdWorld) {
  assert.equal(result(this).leavesAfterTheEnd, false);
});

Then('the trip leaves after the event is over', function (this: ZaezdWorld) {
  assert.equal(result(this).leavesAfterTheEnd, true);
});

Then('the trip cannot say whether it leaves after the event is over', function (this: ZaezdWorld) {
  assert.equal(result(this).leavesAfterTheEnd, undefined);
});

const FEASIBILITY_NOTES: Readonly<Record<string, Feasibility['notes'][number]>> = {
  'the catalogue gave no opening time': 'opening-time-unknown',
  'the catalogue gave no closing time': 'closing-time-unknown',
};

Then(
  /^the trip notes that (.+)$/,
  function (this: ZaezdWorld, phrase: string) {
    const note = FEASIBILITY_NOTES[phrase];
    assert.ok(note !== undefined, `the feature used an explanation nobody mapped: "${phrase}"`);
    assert.ok(result(this).notes.includes(note));
  },
);
