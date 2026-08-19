import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { buildCheckout } from '../../src/composer/build-checkout.ts';
import type { TripVariant } from '../../src/composer/packages.ts';
import { checkFeasibility } from '../../src/composer/feasibility.ts';
import { parseEventPrice, priceTrip } from '../../src/composer/pricing.ts';
import { normalizeHotels, normalizeTransport } from '../../src/sources/normalize.ts';
import { rankHotels } from '../../src/composer/hotels.ts';
import { TtlCache } from '../../src/sources/cache.ts';
import { tutuClient, type TutuClient } from '../../src/sources/tutu.ts';
import { replayTransport, type McpTransport } from '../../src/sources/mcp-client.ts';
import { loadRecordings } from '../../src/sources/replay.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { CheckoutLink } from '../../src/composer/types.ts';
import type { ZaezdWorld } from '../support/world.ts';

type Broken = { details?: boolean; links?: boolean };

function client(broken: Broken): TutuClient {
  const recordings = loadRecordings();
  const base = replayTransport('tutu', recordings);
  const transport: McpTransport = {
    async call(tool, args, options) {
      if (broken.details === true && tool === 'get_offer_details') {
        throw new Error('the hotel details did not answer');
      }
      if (broken.links === true && tool === 'create_checkout_link') {
        throw new Error('the checkout link could not be built');
      }
      return base.call(tool, args, options);
    },
  };
  return tutuClient({ transport, cache: new TtlCache({ clock: () => 0 }) });
}

function variantFrom(world: ZaezdWorld, options: { withHotel: boolean }): TripVariant {
  const there = normalizeTransport(loadPayload('tutu/demo-out.json')).legs[0];
  const home = normalizeTransport(loadPayload('tutu/demo-back.json')).legs[0];
  assert.ok(there !== undefined && home !== undefined, 'the recordings hold no journeys');

  // The room the product would pick: nearest to the recorded venue, which is also the room the
  // checkout links were recorded for. Picking any other one would test the fallback, not the cart.
  const venuePoint = loadPayload<{ lat: string; lon: string }[]>('enrich/nominatim-street.json')[0];
  assert.ok(venuePoint !== undefined, 'the venue was never geocoded in the recordings');

  const listing = normalizeHotels(loadPayload('tutu/demo-hotels.json'));
  const room = rankHotels({
    hotels: listing.hotels,
    venue: { precision: 'exact', lat: Number(venuePoint.lat), lng: Number(venuePoint.lon) },
  }).hotels[0];
  assert.ok(room !== undefined, 'the recordings hold no hotels');

  void world;
  return {
    id: 'demo',
    outbound: there,
    back: home,
    ...(options.withHotel ? { hotel: room } : {}),
    cost: priceTrip({
      outbound: there.price,
      back: home.price,
      ...(options.withHotel ? { hotel: room.hotel.price } : {}),
      nights: options.withHotel ? 1 : 0,
      eventPrice: parseEventPrice(undefined),
    }),
    feasibility: checkFeasibility({
      event: { startDate: '2026-08-20', endDate: '2026-08-20' },
      arrivalAt: there.arrivalAt,
      returnDepartureAt: home.departureAt,
    }),
    totalDurationMin: there.durationMin + home.durationMin,
  };
}

function setUp(world: ZaezdWorld, broken: Broken = {}, options = { withHotel: true, recorded: false }): void {
  world.remember('variant', variantFrom(world, options));
  world.remember('checkout-options', {
    tutu: client(broken),
    checkIn: '2026-08-20',
    checkOut: '2026-08-21',
    adults: 1,
    ...(options.recorded ? { recorded: true } : {}),
  });
}

Given('a trip assembled from the recordings', function (this: ZaezdWorld) {
  setUp(this);
});

Given('the hotel details cannot be fetched', function (this: ZaezdWorld) {
  setUp(this, { details: true });
});

Given('Tutu refuses to build checkout links', function (this: ZaezdWorld) {
  setUp(this, { links: true });
});

Given('the links come from a recording', function (this: ZaezdWorld) {
  setUp(this, {}, { withHotel: true, recorded: true });
});

Given('the trip has no hotel', function (this: ZaezdWorld) {
  setUp(this, {}, { withHotel: false, recorded: false });
});

When('the checkout list is built', async function (this: ZaezdWorld) {
  this.remember(
    'checkout',
    await buildCheckout(
      this.recall<TripVariant>('variant'),
      this.recall<Parameters<typeof buildCheckout>[1]>('checkout-options'),
    ),
  );
});

function checkout(world: ZaezdWorld): readonly CheckoutLink[] {
  return world.recall<readonly CheckoutLink[]>('checkout');
}

const PARTS: Readonly<Record<string, CheckoutLink['part']>> = {
  'the journey there': 'outbound',
  'the room': 'hotel',
  'the journey home': 'back',
};

Then(/^the list is (.+)$/, function (this: ZaezdWorld, listed: string) {
  const expected = listed.split(',').map((name) => {
    const part = PARTS[name.trim()];
    assert.ok(part !== undefined, `the feature named a part nobody mapped: "${name.trim()}"`);
    return part;
  });
  assert.deepEqual(
    checkout(this).map((link) => link.part),
    expected,
  );
});

Then('every link carries a label', function (this: ZaezdWorld) {
  for (const link of checkout(this)) assert.ok(link.label.length > 0);
});

Then('no link is called a cart unless Tutu called it one', function (this: ZaezdWorld) {
  for (const link of checkout(this)) {
    if (link.opensACart) assert.equal(link.kind, 'checkout_deeplink');
  }
});

function roomLink(world: ZaezdWorld): CheckoutLink {
  const link = checkout(world).find((item) => item.part === 'hotel');
  assert.ok(link !== undefined, 'there is no room link');
  return link;
}

Then('the room link opens a cart', function (this: ZaezdWorld) {
  assert.equal(roomLink(this).opensACart, true);
});

Then('the room link does not open a cart', function (this: ZaezdWorld) {
  assert.equal(roomLink(this).opensACart, false);
});

Then('the room link reads {string}', function (this: ZaezdWorld, text: string) {
  assert.equal(roomLink(this).label, text);
});

Then('every link reads {string}', function (this: ZaezdWorld, text: string) {
  for (const link of checkout(this)) assert.equal(link.label, text);
});

Then('every link is marked as recorded', function (this: ZaezdWorld) {
  for (const link of checkout(this)) assert.equal(link.recorded, true);
});
