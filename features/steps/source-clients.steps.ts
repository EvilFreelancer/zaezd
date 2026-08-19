import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { TtlCache } from '../../src/sources/cache.ts';
import { confcalClient, type ConfcalClient } from '../../src/sources/confcal.ts';
import { tutuClient, type TutuClient } from '../../src/sources/tutu.ts';
import { SourceError } from '../../src/sources/normalize.ts';
import { replayTransport, type McpTransport } from '../../src/sources/mcp-client.ts';
import { loadRecordings } from '../../src/sources/replay.ts';
import type { CatalogueEvent, CityDirectory, HotelSearch, TransportSearch } from '../../src/composer/types.ts';
import { eventQueryFor } from '../../src/composer/build-trip.ts';
import type { EventQuery } from '../../src/sources/confcal.ts';
import type { ZaezdWorld } from '../support/world.ts';

type Asked = { readonly tool: string; readonly args: Readonly<Record<string, unknown>> };

/** Wraps a transport so a scenario can see what was asked, how often, and in what order. */
function watched(
  inner: McpTransport,
  log: Asked[],
  overlap: { max: number; current: number },
): McpTransport {
  return {
    async call(tool, args, options) {
      log.push({ tool, args });
      overlap.current += 1;
      overlap.max = Math.max(overlap.max, overlap.current);
      try {
        // A microtask boundary, so two calls started together really would overlap.
        await Promise.resolve();
        return await inner.call(tool, args, options);
      } finally {
        overlap.current -= 1;
      }
    },
  };
}

type Wiring = {
  readonly confcal: ConfcalClient;
  readonly tutu: TutuClient;
  readonly asked: Asked[];
  readonly overlap: { max: number; current: number };
  readonly reopened: { count: number };
  /** How many questions had been asked when the session was opened. */
  readonly opened: { before: number };
};

function wire(
  world: ZaezdWorld,
  options: { sessionLost?: boolean; down?: boolean; noSession?: boolean; opaqueRefusal?: boolean } = {},
): Wiring {
  const recordings = loadRecordings();
  const asked: Asked[] = [];
  const overlap = { max: 0, current: 0 };
  const reopened = { count: 0 };
  const opened = { before: -1 };

  const base = replayTransport('confcal', recordings);
  let sessionAlive = options.sessionLost !== true && options.noSession !== true;
  let refusedOnce = false;

  const confcalTransport: McpTransport = {
    async call(tool, args, callOptions) {
      if (options.down === true) throw new SourceError('confcal', 'session is gone');
      if (options.opaqueRefusal === true && !refusedOnce) {
        refusedOnce = true;
        // What the server really answers: a status code, with the reason only in the body.
        throw new SourceError('confcal', 'answered with HTTP 400', {
          error: { code: -32600, message: 'Bad Request: Missing session ID' },
        });
      }
      if (!sessionAlive) {
        sessionAlive = false;
        throw new SourceError('confcal', 'session is gone');
      }
      return base.call(tool, args, callOptions);
    },
  };

  const wiring: Wiring = {
    confcal: confcalClient({
      transport: watched(confcalTransport, asked, overlap),
      cache: new TtlCache({ clock: () => 0 }),
      reopenSession: async () => {
        reopened.count += 1;
        opened.before = asked.length;
        sessionAlive = options.down !== true;
      },
      hasSession: () => sessionAlive,
    }),
    tutu: tutuClient({
      transport: watched(replayTransport('tutu', recordings), asked, overlap),
      cache: new TtlCache({ clock: () => 0 }),
    }),
    asked,
    overlap,
    reopened,
    opened,
  };

  world.remember('wiring', wiring);
  return wiring;
}

function wiring(world: ZaezdWorld): Wiring {
  return world.recall<Wiring>('wiring');
}

Given('the catalogue and Tutu are wired to the recordings', function (this: ZaezdWorld) {
  wire(this);
});

Given('the catalogue has never been asked anything yet', function (this: ZaezdWorld) {
  wire(this, { noSession: true });
});

Given(
  'the catalogue refuses the first call with a status code and no explanation',
  function (this: ZaezdWorld) {
    wire(this, { opaqueRefusal: true });
  },
);

Given('the catalogue lost its session', function (this: ZaezdWorld) {
  wire(this, { sessionLost: true });
});

Given('the catalogue is down', function (this: ZaezdWorld) {
  wire(this, { down: true });
});

/** The catalogue is asked exactly what the product asks it: every city that has events, bar home. */
/**
 * The question the product itself asks, built by the product's own function.
 *
 * Spelling it out here once let the recorded arguments and the asked-for arguments drift apart
 * the moment the limit changed, and every replay lookup missed.
 */
async function aiOffline(world: ZaezdWorld): Promise<EventQuery> {
  const directory = await wiring(world).confcal.listCities();
  return eventQueryFor(directory.cities, 'moscow', { topics: ['ai'] });
}

When(
  'the catalogue is asked for offline events on artificial intelligence',
  async function (this: ZaezdWorld) {
    this.remember('events', await wiring(this).confcal.searchEvents(await aiOffline(this)));
  },
);

When('the catalogue is asked and refuses', async function (this: ZaezdWorld) {
  try {
    await wiring(this).confcal.searchEvents(await aiOffline(this));
    this.remember('refusal', undefined);
  } catch (error) {
    this.remember('refusal', error);
  }
});

When('the catalogue directory is asked for', async function (this: ZaezdWorld) {
  this.remember('directory', await wiring(this).confcal.listCities());
});

When('two different questions are asked at the same moment', async function (this: ZaezdWorld) {
  const client = wiring(this).confcal;
  await Promise.all([client.searchEvents(await aiOffline(this)), client.listCities()]);
});

When(
  'Tutu is asked for journeys from {word} to {word} on {word}',
  async function (this: ZaezdWorld, origin: string, destination: string, departureDate: string) {
    this.remember(
      'transport',
      await wiring(this).tutu.searchTransport({ origin, destination, departureDate }),
    );
  },
);

When(
  'Tutu is asked for hotels in {word} from {word} to {word}',
  async function (this: ZaezdWorld, city: string, checkIn: string, checkOut: string) {
    this.remember('hotels', await wiring(this).tutu.searchHotels({ city, checkIn, checkOut }));
  },
);

When('the same journeys are asked for twice', async function (this: ZaezdWorld) {
  const query = { origin: 'Москва', destination: 'Санкт-Петербург', departureDate: '2026-08-20' };
  await wiring(this).tutu.searchTransport(query);
  await wiring(this).tutu.searchTransport(query);
});

When('the same checkout link is asked for twice', async function (this: ZaezdWorld) {
  const search = await wiring(this).tutu.searchTransport({
    origin: 'Москва',
    destination: 'Санкт-Петербург',
    departureDate: '2026-08-20',
  });
  const rail = search.legs.find((leg) => leg.mode === 'railway');
  assert.ok(rail?.checkoutRef !== undefined, 'the recorded journeys carry no checkout handle');

  wiring(this).asked.length = 0;
  await wiring(this).tutu.createCheckoutLink(rail.checkoutRef);
  await wiring(this).tutu.createCheckoutLink(rail.checkoutRef);
});

Then('{int} events come back', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<CatalogueEvent[]>('events').length, count);
});

Then('the event {string} is among them', function (this: ZaezdWorld, title: string) {
  assert.ok(this.recall<CatalogueEvent[]>('events').some((event) => event.title === title));
});

Then('it lists {int} cities', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<CityDirectory>('directory').citiesTotal, count);
});

Then('the session was reopened once', function (this: ZaezdWorld) {
  assert.equal(wiring(this).reopened.count, 1);
});

Then('the refusal names the catalogue', function (this: ZaezdWorld) {
  const refusal = this.recall<unknown>('refusal');
  assert.ok(refusal instanceof SourceError);
  assert.equal(refusal.source, 'confcal');
});

Then('the catalogue answered them one at a time', function (this: ZaezdWorld) {
  assert.equal(wiring(this).overlap.max, 1);
});

Then('{int} journeys come back', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<TransportSearch>('transport').legs.length, count);
});

Then('{int} hotels come back', function (this: ZaezdWorld, count: number) {
  assert.equal(this.recall<HotelSearch>('hotels').hotels.length, count);
});

Then(
  'the listing names {word} as the geography it resolved',
  function (this: ZaezdWorld, name: string) {
    assert.equal(this.recall<HotelSearch>('hotels').resolvedGeoName, name);
  },
);

Then(
  'the question Tutu was asked names the city and no transport identifier',
  function (this: ZaezdWorld) {
    const call = wiring(this).asked.find((item) => item.tool === 'search_hotels');
    assert.ok(call !== undefined, 'Tutu was never asked for hotels');
    assert.equal(call.args['city_name'], 'Санкт-Петербург');
    assert.equal(call.args['geo_id'], undefined);
    assert.equal(call.args['from_geo_id'], undefined);
  },
);

Then('Tutu was asked twice', function (this: ZaezdWorld) {
  assert.equal(wiring(this).asked.filter((item) => item.tool === 'create_checkout_link').length, 2);
});

Then('Tutu was asked once', function (this: ZaezdWorld) {
  assert.equal(
    wiring(this).asked.filter((item) => item.tool === 'search_multitransport').length,
    1,
  );
});

Then('the session was opened before the question', function (this: ZaezdWorld) {
  const { opened, reopened } = wiring(this);
  assert.equal(reopened.count, 1, 'no session was opened at all');
  assert.equal(opened.before, 0, 'the question went out before the session existed');
});
