import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type {
  CatalogueEvent,
  CityDirectory,
  CoverageNote,
  ResolvedCity,
  SkipReason,
} from '../../src/composer/types.ts';
import {
  describeCoverage,
  selectEvents,
  type SelectionResult,
} from '../../src/composer/selection.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

const SLUGS: Readonly<Record<string, string>> = { Москва: 'moscow', Казань: 'kazan' };

/**
 * Scenario state lives on the World, never in a module variable: Cucumber builds one World
 * per scenario, and that is what keeps two scenarios from leaning on each other.
 */
function nextId(world: ZaezdWorld): number {
  const used = world.scratch.has('inventedIds') ? world.recall<number>('inventedIds') : 900;
  world.remember('inventedIds', used + 1);
  return used + 1;
}

function invent(
  world: ZaezdWorld,
  title: string,
  city: string | undefined,
  from: string,
  to: string,
  opens?: string,
): CatalogueEvent {
  return {
    id: nextId(world),
    title,
    url: `https://example.test/${encodeURIComponent(title)}`,
    startDate: from,
    endDate: to,
    format: 'offline',
    topics: ['ai'],
    ...(city === undefined ? {} : { city, citySlug: SLUGS[city] ?? city.toLowerCase() }),
    ...(opens === undefined ? {} : { startsAt: `${from}T${opens}:00+03:00` }),
  };
}

function addEvent(world: ZaezdWorld, event: CatalogueEvent): void {
  const events = world.scratch.has('events') ? world.recall<CatalogueEvent[]>('events') : [];
  world.remember('events', [...events, event]);
}

/** The directory as the catalogue writes it, before anything renames its fields. */
type RecordedDirectory = {
  readonly total: number;
  readonly online_count: number;
  readonly items: readonly { slug: string; title: string; events_count: number }[];
};

function asDirectory(recorded: RecordedDirectory): CityDirectory {
  return {
    citiesTotal: recorded.total,
    onlineEvents: recorded.online_count,
    cities: recorded.items.map((city) => ({
      slug: city.slug,
      title: city.title,
      upcomingEvents: city.events_count,
    })),
  };
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
    addEvent(this, invent(this, title, city, from, to));
  },
);

Given(
  'an event {string} with no city running from {word} to {word}',
  function (this: ZaezdWorld, title: string, from: string, to: string) {
    addEvent(this, invent(this, title, undefined, from, to));
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
    addEvent(this, invent(this, title, city, from, to, opens));
  },
);

Given('the recorded directory of catalogue cities', function (this: ZaezdWorld) {
  this.remember('directory', asDirectory(loadPayload<RecordedDirectory>('confcal/list-cities.json')));
});

Given('one page of the recorded directory of catalogue cities', function (this: ZaezdWorld) {
  this.remember(
    'directory',
    asDirectory(loadPayload<RecordedDirectory>('confcal/list-cities-page-2.json')),
  );
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

When(
  'the events are narrowed down, and narrowed down again in the opposite order',
  function (this: ZaezdWorld) {
    const events = this.recall<CatalogueEvent[]>('events');
    const first = narrow(this);
    this.remember('events', [...events].reverse());
    const second = narrow(this);
    this.remember('selections', [first, second]);
  },
);

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

const REASONS: Readonly<Record<string, SkipReason>> = {
  'are online and need no travel': 'online',
  'are already in Москва': 'origin-city',
  'name no city to travel to': 'no-destination',
  'can no longer be reached in time': 'unreachable',
  'fall outside the requested dates': 'outside-window',
  'contradict themselves': 'unreadable',
  'did not fit on the shortlist': 'over-the-cap',
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

Then('it counts {int} upcoming online events', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<CoverageNote>('coverage').onlineEvents, count);
});

Then('it admits the counts cover only part of the directory', function (this: ZaezdWorld) {
  const coverage = this.recall<CoverageNote>('coverage');
  assert.equal(coverage.countsCoverWholeDirectory, false);
  assert.equal(coverage.citiesWithEvents, undefined);
  assert.deepEqual(coverage.busiestCities, []);
});
