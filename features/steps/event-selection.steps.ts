import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { CatalogueEvent, ResolvedCity } from '../../src/composer/types.ts';
import {
  describeCoverage,
  selectEvents,
  type CityDirectory,
  type CoverageNote,
  type SelectionResult,
  type SkipReason,
} from '../../src/composer/selection.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

const SLUGS: Readonly<Record<string, string>> = { Москва: 'moscow', Казань: 'kazan' };

let inventedId = 900;

function invent(
  title: string,
  city: string,
  from: string,
  to: string,
  opens?: string,
): CatalogueEvent {
  inventedId += 1;
  return {
    id: inventedId,
    title,
    startDate: from,
    endDate: to,
    format: 'offline',
    topics: ['ai'],
    city,
    citySlug: SLUGS[city] ?? city.toLowerCase(),
    ...(opens === undefined ? {} : { startsAt: `${from}T${opens}:00+03:00` }),
  };
}

function addEvent(world: ZaezdWorld, event: CatalogueEvent): void {
  const events = world.scratch.has('events') ? world.recall<CatalogueEvent[]>('events') : [];
  world.remember('events', [...events, event]);
}

Given('the traveller sets out from {word}', function (this: ZaezdWorld, city: string) {
  const origin: ResolvedCity = { title: city, slug: SLUGS[city] ?? city.toLowerCase() };
  this.remember('origin', origin);
});

Given('today is {word}', function (this: ZaezdWorld, day: string) {
  this.remember('asOf', day);
});

Given('the traveller can only travel until {word}', function (this: ZaezdWorld, day: string) {
  this.remember('dateTo', day);
});

Given(
  'an event {string} in {word} running from {word} to {word}',
  function (this: ZaezdWorld, title: string, city: string, from: string, to: string) {
    addEvent(this, invent(title, city, from, to));
  },
);

Given(
  'an event {string} in {word} running from {word} to {word} that opens at {word}',
  function (
    this: ZaezdWorld,
    title: string,
    city: string,
    from: string,
    to: string,
    opens: string,
  ) {
    addEvent(this, invent(title, city, from, to, opens));
  },
);

Given('the recorded directory of catalogue cities', function (this: ZaezdWorld) {
  this.remember('directory', loadPayload<CityDirectory>('confcal/list-cities.json'));
});

function narrow(world: ZaezdWorld): SelectionResult {
  return selectEvents({
    events: world.recall<CatalogueEvent[]>('events'),
    origin: world.recall<ResolvedCity>('origin'),
    asOf: world.recall<string>('asOf'),
    ...(world.scratch.has('dateTo') ? { dateTo: world.recall<string>('dateTo') } : {}),
  });
}

When('the events are narrowed down', function (this: ZaezdWorld) {
  this.remember('selection', narrow(this));
});

When('the events are narrowed down twice', function (this: ZaezdWorld) {
  this.remember('selections', [narrow(this), narrow(this)]);
});

When('the coverage is described', function (this: ZaezdWorld) {
  this.remember('coverage', describeCoverage(this.recall<CityDirectory>('directory')));
});

Then('no event is offered as a trip', function (this: ZaezdWorld) {
  const selection = this.recall<SelectionResult>('selection');
  assert.equal(selection.primary, undefined);
  assert.deepEqual(selection.alternatives, []);
});

Then('the first offer is {string}', function (this: ZaezdWorld, title: string) {
  assert.equal(this.recall<SelectionResult>('selection').primary?.title, title);
});

Then('at most five events are offered', function (this: ZaezdWorld) {
  const { primary, alternatives } = this.recall<SelectionResult>('selection');
  assert.ok((primary === undefined ? 0 : 1) + alternatives.length <= 5);
});

Then('one event is chosen for the full trip', function (this: ZaezdWorld) {
  assert.ok(this.recall<SelectionResult>('selection').primary !== undefined);
});

Then('the rest are listed without being computed', function (this: ZaezdWorld) {
  const { primary, alternatives } = this.recall<SelectionResult>('selection');
  assert.ok(alternatives.length > 0, 'the recorded catalogue should offer more than one event');
  assert.ok(alternatives.every((event) => event.id !== primary?.id));
});

const REASONS: Readonly<Record<string, SkipReason>> = {
  'are online and need no travel': 'online',
  'are already in Москва': 'origin-city',
  'have already started': 'unreachable',
  'fall outside the requested dates': 'outside-window',
};

Then(
  /^the answer explains that those events (.+)$/,
  function (this: ZaezdWorld, phrase: string) {
    const reason = REASONS[phrase];
    assert.ok(reason !== undefined, `the feature used an explanation nobody mapped: "${phrase}"`);

    const note = this.recall<SelectionResult>('selection').skipped.find(
      (item) => item.reason === reason,
    );
    assert.ok(note !== undefined, `nothing was skipped as "${reason}"`);
    assert.ok(note.events.length > 0);
  },
);

Then('the answer is not silent about why', function (this: ZaezdWorld) {
  assert.ok(this.recall<SelectionResult>('selection').emptyReason !== undefined);
});

Then('both answers are identical', function (this: ZaezdWorld) {
  const [first, second] = this.recall<SelectionResult[]>('selections');
  assert.deepEqual(second, first);
});

Then('it says the catalogue lists {int} cities', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<CoverageNote>('coverage').citiesListed, count);
});

Then('it says {int} of them have upcoming events', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<CoverageNote>('coverage').citiesWithEvents, count);
});

Then('it names {word} as the city with the most events', function (this: ZaezdWorld, city: string) {
  assert.equal(this.recall<CoverageNote>('coverage').busiestCities[0]?.title, city);
});

Then(
  'it counts {int} upcoming events with no city at all',
  function (this: ZaezdWorld, count: number) {
    assert.equal(this.recall<CoverageNote>('coverage').onlineEvents, count);
  },
);
