import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { buildTrip, type Stage, type TripResult } from '../../src/composer/build-trip.ts';
import { TtlCache } from '../../src/sources/cache.ts';
import { confcalClient } from '../../src/sources/confcal.ts';
import { tutuClient } from '../../src/sources/tutu.ts';
import { replayTransport, type McpTransport } from '../../src/sources/mcp-client.ts';
import { loadRecordings } from '../../src/sources/replay.ts';
import { replayHttp, type HttpFetch } from '../../src/enrich/http.ts';
import type { ZaezdWorld } from '../support/world.ts';

type Broken = { hotels?: boolean; transport?: boolean; enrich?: boolean };

function enrichHttp(broken: Broken): HttpFetch {
  const recordings = loadRecordings();
  return async (url, args) => {
    if (broken.enrich === true) throw new Error('the source did not answer');
    const source = url.includes('nominatim')
      ? 'nominatim'
      : url.includes('routed-foot')
        ? 'osrm'
        : url.includes('isdayoff')
          ? 'isdayoff'
          : 'open-meteo';
    return replayHttp(source, recordings)(url, args);
  };
}

function build(world: ZaezdWorld, broken: Broken = {}): void {
  const recordings = loadRecordings();
  const cache = new TtlCache({ clock: () => 0 });
  const stages: Stage[] = [];

  const tutuBase = replayTransport('tutu', recordings);
  const tutuTransport: McpTransport = {
    async call(tool, args, options) {
      if (broken.hotels === true && tool === 'search_hotels') {
        throw new Error('the hotel search did not answer');
      }
      if (broken.transport === true && tool === 'search_multitransport') {
        throw new Error('the transport search did not answer');
      }
      return tutuBase.call(tool, args, options);
    },
  };

  const enrich = { http: enrichHttp(broken), cache };

  world.remember('stages', stages);
  world.remember('options', {
    confcal: confcalClient({ transport: replayTransport('confcal', recordings), cache }),
    tutu: tutuClient({ transport: tutuTransport, cache }),
    geo: enrich,
    calendar: enrich,
    weather: enrich,
    asOf: recordings.referenceDate,
    computedAt: recordings.recordedAt,
    mode: 'replay' as const,
    onStage: (stage: Stage) => stages.push(stage),
  });
}

Given('the whole product is wired to the recordings', function (this: ZaezdWorld) {
  build(this);
});

Given('the hotel search fails', function (this: ZaezdWorld) {
  build(this, { hotels: true });
});

Given('the transport search fails', function (this: ZaezdWorld) {
  build(this, { transport: true });
});

Given('every optional source of the product fails', function (this: ZaezdWorld) {
  build(this, { enrich: true });
});

async function assemble(world: ZaezdWorld, origin: string): Promise<TripResult> {
  return buildTrip(
    { topics: ['ai'], origin, adults: 1 },
    world.recall<Parameters<typeof buildTrip>[1]>('options'),
  );
}

When(
  'a trip is assembled for artificial intelligence from {word}',
  async function (this: ZaezdWorld, origin: string) {
    this.remember('trip', await assemble(this, origin));
  },
);

When(
  'a trip is assembled for artificial intelligence from {word} twice',
  async function (this: ZaezdWorld, origin: string) {
    const first = await assemble(this, origin);
    const second = await assemble(this, origin);
    this.remember('trip', first);
    this.remember('both', [first, second]);
  },
);

function trip(world: ZaezdWorld): TripResult {
  return world.recall<TripResult>('trip');
}

Then('the trip is for {string}', function (this: ZaezdWorld, title: string) {
  assert.equal(trip(this).event?.event.title, title);
});

Then('the trip runs from {word} to {word}', function (this: ZaezdWorld, from: string, to: string) {
  assert.equal(trip(this).stay?.checkIn, from);
  assert.equal(trip(this).stay?.checkOut, to);
});

Then('at least one package is offered', function (this: ZaezdWorld) {
  assert.ok(trip(this).packages.length > 0, 'no package was assembled');
});

Then('no package is offered', function (this: ZaezdWorld) {
  assert.deepEqual(trip(this).packages, []);
});

Then('other events are listed without being computed', function (this: ZaezdWorld) {
  assert.ok(trip(this).alternatives.length > 0);
});

Then('the answer says the catalogue lists {int} cities', function (this: ZaezdWorld, count: number) {
  assert.equal(trip(this).coverage.citiesListed, count);
});

Then('every package names a journey there and a journey home', function (this: ZaezdWorld) {
  for (const item of trip(this).packages) {
    assert.ok(item.variant.outbound.offerId.length > 0);
    assert.ok(item.variant.back.offerId.length > 0);
  }
});

Then('every package carries a total price', function (this: ZaezdWorld) {
  for (const item of trip(this).packages) assert.ok(item.variant.cost.total > 0);
});

Then("the trip's venue is located precisely", function (this: ZaezdWorld) {
  assert.equal(trip(this).event?.venueLocation.precision, 'exact');
});

Then("the trip's venue is not located", function (this: ZaezdWorld) {
  assert.equal(trip(this).event?.venueLocation.precision, 'unknown');
});

Then('the walk from the nearest hotel is given in minutes', function (this: ZaezdWorld) {
  assert.ok((trip(this).event?.walkingMinutes ?? 0) > 0);
});

Then('a forecast is included', function (this: ZaezdWorld) {
  assert.ok((trip(this).forecast?.length ?? 0) > 0);
});

Then('no forecast is included', function (this: ZaezdWorld) {
  assert.equal(trip(this).forecast, undefined);
});

Then('the working days were not counted', function (this: ZaezdWorld) {
  assert.equal(trip(this).workingDaysCounted, false);
});

Then('both trips are identical', function (this: ZaezdWorld) {
  const [first, second] = this.recall<TripResult[]>('both');
  assert.deepEqual(second, first);
});

Then(/^the stages announced were (.+)$/, function (this: ZaezdWorld, listed: string) {
  const expected = listed.split(',').map((name) => name.trim());
  assert.deepEqual(this.recall<Stage[]>('stages'), expected);
});

const OUTAGES: Readonly<Record<string, string>> = {
  'the hotels did not load': 'hotels',
  'the journeys did not load': 'transport-out',
};

Then(/^the answer reports that (.+)$/, function (this: ZaezdWorld, phrase: string) {
  const what = OUTAGES[phrase];
  assert.ok(what !== undefined, `the feature named an outage nobody mapped: "${phrase}"`);
  assert.ok(trip(this).sourceNotes.some((note) => note.what === what));
});

Then('no package claims to be the full price of taking part', function (this: ZaezdWorld) {
  for (const item of trip(this).packages) assert.equal(item.variant.cost.complete, false);
});
