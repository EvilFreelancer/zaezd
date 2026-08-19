import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  SourceError,
  normalizeEvents,
  normalizeHotels,
  normalizeTransport,
  unwrapToolResult,
} from '../../src/sources/normalize.ts';
import type {
  CatalogueEvent,
  HotelSearch,
  TransportMode,
  TransportSearch,
} from '../../src/composer/types.ts';
import { loadEnvelope } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

const ROUTES: Readonly<Record<string, string>> = {
  there: 'tutu/demo-out.json',
  home: 'tutu/demo-back.json',
};

const MODE_WORDS: Readonly<Record<string, TransportMode>> = {
  flights: 'avia',
  trains: 'railway',
  buses: 'bus',
  'suburban trains': 'etrain',
};

/**
 * The whole MCP envelope, exactly as it came off the wire. The scenarios read it through the
 * same unwrapper the clients use, so the JSON-inside-a-text-block trick is exercised rather
 * than bypassed.
 */
function envelopeOf(fixture: string): unknown {
  return (loadEnvelope(fixture).response as { envelope: unknown }).envelope;
}

Given(
  'the recorded catalogue answer for offline events on artificial intelligence',
  function (this: ZaezdWorld) {
    this.remember('answer', { source: 'confcal', body: envelopeOf('confcal/events-ai-offline.json') });
  },
);

Given('the recorded transport answer {word}', function (this: ZaezdWorld, direction: string) {
  const fixture = ROUTES[direction];
  assert.ok(fixture !== undefined, `no recorded transport answer "${direction}"`);
  this.remember('answer', { source: 'tutu', body: envelopeOf(fixture) });
});

Given(
  'the recorded transport answer for a route with no direct connection',
  function (this: ZaezdWorld) {
    this.remember('answer', {
      source: 'tutu',
      body: envelopeOf('tutu/multitransport-thin-route.json'),
    });
  },
);

Given('the recorded hotel listing of the demo trip', function (this: ZaezdWorld) {
  this.remember('hotel-answer', envelopeOf('tutu/demo-hotels.json'));
  this.remember('answer', { source: 'tutu', body: envelopeOf('tutu/demo-hotels.json') });
});

Given('the recorded answer where Tutu rejected an unknown argument', function (this: ZaezdWorld) {
  this.remember('answer', { source: 'tutu', body: envelopeOf('tutu/error-extra-key.json') });
});

type Answer = { readonly source: string; readonly body: unknown };

function payload(world: ZaezdWorld): unknown {
  const { source, body } = world.recall<Answer>('answer');
  return unwrapToolResult(source, body);
}

When('the answer is read', function (this: ZaezdWorld) {
  const { source } = this.recall<Answer>('answer');
  const data = payload(this);

  if (source === 'confcal') {
    this.remember('events', normalizeEvents(data));
    return;
  }
  const shaped = data as { hotels?: unknown };
  if (shaped.hotels !== undefined) {
    this.remember('hotels', normalizeHotels(data));
    return;
  }
  this.remember('transport', normalizeTransport(data));
});

When('both answers are read', function (this: ZaezdWorld) {
  const transport = normalizeTransport(
    unwrapToolResult('tutu', envelopeOf('tutu/demo-out.json')),
  );
  this.remember('transport', transport);
  this.remember('hotels', normalizeHotels(unwrapToolResult('tutu', this.recall('hotel-answer'))));
});

When('the answer is read and refused', function (this: ZaezdWorld) {
  try {
    payload(this);
    this.remember('refusal', undefined);
  } catch (error) {
    this.remember('refusal', error);
  }
});

function events(world: ZaezdWorld): readonly CatalogueEvent[] {
  return world.recall<CatalogueEvent[]>('events');
}

function eventNamed(world: ZaezdWorld, title: string): CatalogueEvent {
  const event = events(world).find((item) => item.title === title);
  assert.ok(event !== undefined, `the recorded answer has no event titled "${title}"`);
  return event;
}

function transport(world: ZaezdWorld): TransportSearch {
  return world.recall<TransportSearch>('transport');
}

Then('{int} events are understood', function (this: ZaezdWorld, count: number) {
  assert.equal(events(this).length, count);
});

Then('the event {string} is in {word}', function (this: ZaezdWorld, title: string, city: string) {
  assert.equal(eventNamed(this, title).city, city);
});

Then('the event {string} has no venue', function (this: ZaezdWorld, title: string) {
  assert.equal(eventNamed(this, title).venue, undefined);
});

Then('the event {string} has no opening time', function (this: ZaezdWorld, title: string) {
  assert.equal(eventNamed(this, title).startsAt, undefined);
});

Then('the event {string} has a venue', function (this: ZaezdWorld, title: string) {
  assert.ok((eventNamed(this, title).venue ?? '').length > 0);
});

Then('the event {string} has an opening time', function (this: ZaezdWorld, title: string) {
  assert.match(eventNamed(this, title).startsAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

Then('the event {string} has a link', function (this: ZaezdWorld, title: string) {
  assert.match(eventNamed(this, title).url ?? '', /^https?:\/\//);
});

Then('{int} journeys are understood', function (this: ZaezdWorld, count: number) {
  assert.equal(transport(this).legs.length, count);
});

Then('every journey names its price, its duration and both its times', function (this: ZaezdWorld) {
  for (const leg of transport(this).legs) {
    assert.ok(leg.price.amount > 0, `${leg.offerId} has no price`);
    assert.ok(leg.durationMin > 0, `${leg.offerId} has no duration`);
    assert.match(leg.departureAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(leg.arrivalAt, /^\d{4}-\d{2}-\d{2}T/);
  }
});

Then(
  'the answer names {word} and {word} as the places Tutu resolved',
  function (this: ZaezdWorld, from: string, to: string) {
    assert.equal(transport(this).resolvedFrom, from);
    assert.equal(transport(this).resolvedTo, to);
  },
);

Then('every journey carries the checkout handle Tutu returned', function (this: ZaezdWorld) {
  for (const leg of transport(this).legs) {
    assert.ok(leg.checkoutRef !== undefined, `${leg.offerId} lost its checkout_ref`);
  }
});

Then(/^no journey by (.+) is offered$/, function (this: ZaezdWorld, what: string) {
  const mode = MODE_WORDS[what];
  assert.ok(mode !== undefined, `nobody mapped "${what}" to a transport mode`);
  assert.ok(transport(this).legs.every((leg) => leg.mode !== mode));
});

Then(/^(.+) are not reported as unavailable$/, function (this: ZaezdWorld, what: string) {
  const mode = MODE_WORDS[what];
  assert.ok(mode !== undefined, `nobody mapped "${what}" to a transport mode`);
  assert.ok(transport(this).modesUnavailable.every((failure) => failure.mode !== mode));
});

Then(/^(.+) are reported as unavailable$/, function (this: ZaezdWorld, what: string) {
  const mode = MODE_WORDS[what];
  assert.ok(mode !== undefined, `nobody mapped "${what}" to a transport mode`);
  assert.ok(transport(this).modesUnavailable.some((failure) => failure.mode === mode));
});

Then('the reason Tutu gave is kept', function (this: ZaezdWorld) {
  for (const failure of transport(this).modesUnavailable) {
    assert.ok(failure.reason.length > 0);
  }
});

function hotels(world: ZaezdWorld): HotelSearch {
  return world.recall<HotelSearch>('hotels');
}

Then('{int} hotels are understood', function (this: ZaezdWorld, count: number) {
  assert.equal(hotels(this).hotels.length, count);
});

Then('every hotel names its whole-stay price', function (this: ZaezdWorld) {
  for (const hotel of hotels(this).hotels) {
    assert.ok(hotel.price.amount > 0, `${hotel.name} has no price`);
    assert.equal(hotel.price.currency, 'RUB');
  }
});

Then(
  'the answer names {word} as the geography Tutu resolved',
  function (this: ZaezdWorld, name: string) {
    assert.equal(hotels(this).resolvedGeoName, name);
  },
);

Then('the refusal names Tutu', function (this: ZaezdWorld) {
  const refusal = this.recall<unknown>('refusal');
  assert.ok(refusal instanceof SourceError, 'a tool error must be refused, not read as data');
  assert.equal(refusal.source, 'tutu');
});

Then('the refusal repeats what Tutu said', function (this: ZaezdWorld) {
  const refusal = this.recall<unknown>('refusal');
  assert.ok(refusal instanceof SourceError);
  assert.match(refusal.message, /extra_forbidden|not permitted/);
});

Then(
  'the hotel geography and the transport geography are different identifiers',
  function (this: ZaezdWorld) {
    // The hotel index and the transport suggest are different namespaces. Reusing a transport
    // id here is the documented way to get an empty hotels[] next to perfectly live transport,
    // which is why the hotel search identifier never comes from a transport answer.
    const listing = hotels(this);
    assert.ok(listing.resolvedGeoName !== undefined);
    assert.ok(
      !Object.hasOwn(transport(this), 'hotelGeoId'),
      'a transport answer must not carry anything a hotel search could take as its geography',
    );
  },
);
