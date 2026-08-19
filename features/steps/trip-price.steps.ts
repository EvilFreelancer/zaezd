import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { parseEventPrice, priceTrip, type TripCost, type TripCostInput } from '../../src/composer/pricing.ts';
import type { ZaezdWorld } from '../support/world.ts';
import type { RecordedHotel, RecordedVariant } from './tutu.steps.ts';

const RUB = 'RUB';

function draft(world: ZaezdWorld): Partial<TripCostInput> {
  return world.scratch.has('cost-input') ? world.recall<Partial<TripCostInput>>('cost-input') : {};
}

function extend(world: ZaezdWorld, patch: Partial<TripCostInput>): void {
  world.remember('cost-input', { ...draft(world), ...patch });
}

function cheapest(variants: readonly RecordedVariant[]): RecordedVariant {
  return variants.reduce((best, variant) => (variant.price.amount < best.price.amount ? variant : best));
}

Given('the journey there costs {float} ₽', function (this: ZaezdWorld, amount: number) {
  extend(this, { outbound: { amount, currency: RUB } });
});

Given('the journey home costs {float} ₽', function (this: ZaezdWorld, amount: number) {
  extend(this, { back: { amount, currency: RUB } });
});

Given('the hotel costs {float} ₽ for the whole stay', function (this: ZaezdWorld, amount: number) {
  extend(this, { hotel: { amount, currency: RUB } });
});

Given('the stay is {int} nights long', function (this: ZaezdWorld, nights: number) {
  extend(this, { nights });
});

Given('the event price reads {string}', function (this: ZaezdWorld, text: string) {
  extend(this, { eventPrice: parseEventPrice(text) });
});

Given('the traveller has a budget of {float} ₽', function (this: ZaezdWorld, budget: number) {
  extend(this, { budget });
});

When('the trip is priced', function (this: ZaezdWorld) {
  const input = draft(this);
  this.remember('cost', priceTrip({ ...input, eventPrice: input.eventPrice ?? parseEventPrice(undefined) }));
});

When('the cheapest recorded trip is priced', function (this: ZaezdWorld) {
  const there = cheapest(this.recall<RecordedVariant[]>('journeys:Москва->Екатеринбург'));
  const home = cheapest(this.recall<RecordedVariant[]>('journeys:Екатеринбург->Москва'));
  const hotel = this.recall<RecordedHotel[]>('recorded-hotels')[0];
  assert.ok(hotel !== undefined, 'the recorded listing has no hotels');
  assert.equal(hotel.best_offer.price_basis, 'stay_total');

  this.remember('hotel', hotel);
  this.remember(
    'cost',
    priceTrip({
      outbound: there.price,
      back: home.price,
      hotel: hotel.best_offer.price,
      nights: 4,
      eventPrice: parseEventPrice(undefined),
    }),
  );
});

function cost(world: ZaezdWorld): TripCost {
  return world.recall<TripCost>('cost');
}

Then('the total is {float} ₽', function (this: ZaezdWorld, expected: number) {
  assert.equal(cost(this).total, expected);
});

Then('the breakdown adds up to the total', function (this: ZaezdWorld) {
  const { breakdown, total } = cost(this);
  const sum = breakdown.reduce((running, line) => running + Math.round(line.amount * 100), 0);
  assert.equal(sum / 100, total);
});

Then('the event price is shown as text and excluded from the sum', function (this: ZaezdWorld) {
  assert.equal(cost(this).eventPriceExcluded, true);
});

Then('the event price is not shown as unknown', function (this: ZaezdWorld) {
  assert.equal(cost(this).eventPriceExcluded, false);
});

Then('the total is a lower bound, not an exact figure', function (this: ZaezdWorld) {
  assert.equal(cost(this).isLowerBound, true);
});

Then('the total does not claim to be the full price of taking part', function (this: ZaezdWorld) {
  assert.equal(cost(this).complete, false);
});

const MISSING_PARTS: Readonly<Record<string, string>> = {
  'the journey home': 'back',
  'the journey there': 'outbound',
  'the hotel': 'hotel',
};

Then(/^the missing part is named as (.+)$/, function (this: ZaezdWorld, phrase: string) {
  const part = MISSING_PARTS[phrase];
  assert.ok(part !== undefined, `the feature named a part nobody mapped: "${phrase}"`);
  assert.deepEqual([...cost(this).missing], [part]);
});

Then('the budget is exceeded by {float} ₽', function (this: ZaezdWorld, overflow: number) {
  const budget = cost(this).budget;
  assert.ok(budget !== undefined, 'no budget was set');
  assert.equal(budget.exceeded, true);
  assert.equal(budget.remaining, -overflow);
});

Then('the budget is not exceeded', function (this: ZaezdWorld) {
  assert.equal(cost(this).budget?.exceeded, false);
});

Then('{float} ₽ is left over', function (this: ZaezdWorld, remaining: number) {
  assert.equal(cost(this).budget?.remaining, remaining);
});

Then('the hotel line equals the price Tutu returned for the whole stay', function (this: ZaezdWorld) {
  const hotel = this.recall<RecordedHotel>('hotel');
  const line = cost(this).breakdown.find((item) => item.part === 'hotel');
  assert.equal(line?.amount, hotel.best_offer.price.amount);
});
