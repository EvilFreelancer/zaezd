import { describe, expect, it } from 'vitest';
import {
  SourceError,
  normalizeCheckout,
  normalizeCityDirectory,
  normalizeEvents,
  normalizeHotels,
  normalizeTransport,
  unwrapToolResult,
} from '../src/sources/normalize.ts';
import { loadEnvelope, loadPayload } from '../features/support/fixtures.ts';

function envelope(fixture: string): unknown {
  return (loadEnvelope(fixture).response as { envelope: unknown }).envelope;
}

describe('unwrapToolResult', () => {
  it('opens the JSON string both servers hide inside a text block', () => {
    const payload = unwrapToolResult('confcal', envelope('confcal/events-ai-offline.json'));

    expect(payload).toMatchObject({ count: 18 });
  });

  it('refuses a tool error instead of reading its message as data', () => {
    expect(() => unwrapToolResult('tutu', envelope('tutu/error-extra-key.json'))).toThrow(
      SourceError,
    );
  });

  it('keeps what the server said in the refusal', () => {
    expect(() => unwrapToolResult('tutu', envelope('tutu/error-extra-key.json'))).toThrow(
      /extra_forbidden/,
    );
  });

  it('names the source that failed', () => {
    try {
      unwrapToolResult('tutu', envelope('tutu/error-extra-key.json'));
      expect.unreachable('a tool error must be refused');
    } catch (error) {
      expect((error as SourceError).source).toBe('tutu');
    }
  });

  it('prefers structured content when a server bothers to declare it', () => {
    const body = { result: { structuredContent: { hotels: [] }, content: [{ text: 'ignored' }] } };

    expect(unwrapToolResult('tutu', body)).toEqual({ hotels: [] });
  });

  it('hands back prose as prose rather than failing on it', () => {
    const body = { result: { content: [{ text: 'Use search_hotels for lodging.' }] } };

    expect(unwrapToolResult('tutu', body)).toBe('Use search_hotels for lodging.');
  });

  it('refuses a JSON-RPC error', () => {
    expect(() => unwrapToolResult('confcal', { error: { message: 'session expired' } })).toThrow(
      /session expired/,
    );
  });

  it('refuses a body that is not an MCP result at all', () => {
    expect(() => unwrapToolResult('tutu', 'plain text')).toThrow(SourceError);
  });

  it('refuses a result with nothing in it', () => {
    expect(() => unwrapToolResult('tutu', { result: {} })).toThrow(/empty result/);
  });
});

describe('normalizeEvents', () => {
  const events = normalizeEvents(loadPayload('confcal/events-ai-offline.json'));

  it('reads every event in the recorded answer', () => {
    expect(events).toHaveLength(18);
  });

  it('leaves a venue the catalogue did not fill as missing', () => {
    const kazan = events.find((event) => event.title === 'Kazan Digital Week - 2026');

    expect(kazan?.venue).toBeUndefined();
  });

  it('leaves an opening time the catalogue did not fill as missing', () => {
    const kazan = events.find((event) => event.title === 'Kazan Digital Week - 2026');

    expect(kazan?.startsAt).toBeUndefined();
  });

  it('keeps the fields the catalogue did fill', () => {
    const ekb = events.find((event) => event.title.startsWith('Искусственный интеллект'));

    expect(ekb).toMatchObject({
      city: 'Екатеринбург',
      citySlug: 'ekaterinburg',
      startsAt: '2026-08-27T10:00:00+03:00',
      format: 'offline',
    });
  });

  it('treats an empty string as a field the source did not fill', () => {
    const [event] = normalizeEvents({
      items: [
        {
          id: 1,
          title: 'Т',
          start_date: '2026-09-01',
          end_date: '2026-09-01',
          venue: '   ',
          format: 'offline',
          topics: [],
        },
      ],
    });

    expect(event?.venue).toBeUndefined();
  });

  it('refuses an event format nobody has mapped rather than calling it offline', () => {
    expect(() =>
      normalizeEvents({
        items: [
          {
            id: 1,
            title: 'Т',
            start_date: '2026-09-01',
            end_date: '2026-09-01',
            format: 'webinar',
            topics: [],
          },
        ],
      }),
    ).toThrow(/webinar/);
  });

  it('refuses a payload that is not an event list', () => {
    expect(() => normalizeEvents({ items: 'нет' })).toThrow(SourceError);
  });
});

describe('normalizeCityDirectory', () => {
  const directory = normalizeCityDirectory(loadPayload('confcal/list-cities.json'));

  it('reads the whole directory size, not the page size', () => {
    expect(directory.citiesTotal).toBe(21);
  });

  it('reads the count of events with no city to travel to', () => {
    expect(directory.onlineEvents).toBe(40);
  });

  it('renames the wire fields into the vocabulary the rest of the code uses', () => {
    expect(directory.cities[0]).toMatchObject({ slug: expect.any(String), upcomingEvents: expect.any(Number) });
  });
});

describe('normalizeTransport', () => {
  const search = normalizeTransport(loadPayload('tutu/multitransport-msk-ekb-out.json'));

  it('reads every journey on the page', () => {
    expect(search.legs).toHaveLength(6);
  });

  it('keeps the checkout handle Tutu will need back', () => {
    expect(search.legs.every((leg) => leg.checkoutRef !== undefined)).toBe(true);
  });

  it('names the places Tutu resolved, so they can be said back to the traveller', () => {
    expect(search).toMatchObject({ resolvedFrom: 'Москва', resolvedTo: 'Екатеринбург' });
  });

  it('reads the train number out of the first segment', () => {
    const train = search.legs.find((leg) => leg.mode === 'railway');

    expect(train?.voyageNo).toMatch(/\d/);
  });

  it('does not report a mode as unavailable just because the page holds none of it', () => {
    // etrain returned nothing here, and that is not the same as etrain having failed.
    expect(search.modesUnavailable.every((failure) => failure.mode !== 'etrain')).toBe(true);
  });

  it('reports a mode that failed upstream, with the reason', () => {
    const thin = normalizeTransport(loadPayload('tutu/multitransport-thin-route.json'));

    expect(thin.modesUnavailable.map((failure) => failure.mode).sort()).toEqual(['avia', 'railway']);
    expect(thin.modesUnavailable[0]?.reason).toBe('no_route');
  });

  it('drops a transport mode nobody has mapped instead of guessing at it', () => {
    const search = normalizeTransport({
      variants: [
        {
          offer_id: 'x',
          transport: 'teleport',
          price: { amount: 1, currency: 'RUB' },
          duration_min: 1,
          departure_at: '2026-08-26T10:00:00+03:00',
          arrival_at: '2026-08-26T11:00:00+03:00',
        },
      ],
    });

    expect(search.legs).toEqual([]);
  });
});

describe('normalizeHotels', () => {
  const listing = normalizeHotels(loadPayload('tutu/hotels-ekb.json'));

  it('reads every hotel on the page', () => {
    expect(listing.hotels).toHaveLength(20);
  });

  it('keeps the coordinates that make the distance to the venue computable', () => {
    expect(listing.hotels.filter((hotel) => hotel.location !== undefined).length).toBeGreaterThan(0);
  });

  it('names the geography Tutu resolved', () => {
    expect(listing).toMatchObject({ resolvedGeoName: 'Екатеринбург', resolvedGeoType: 'locality' });
  });

  it('carries the search identifier without pretending it lasts', () => {
    expect(listing.searchId).toMatch(/^[0-9a-f]+$/);
  });

  it('refuses a hotel priced on a basis that is not the whole stay', () => {
    // Every Tutu hotel price is a stay total. If that changes, the sum must break loudly
    // rather than quietly become a nightly figure nobody multiplied.
    expect(() =>
      normalizeHotels({
        hotels: [
          {
            hotel_id: '1',
            name: 'Отель',
            best_offer: { price: { amount: 1000, currency: 'RUB' }, price_basis: 'per_night' },
          },
        ],
      }),
    ).toThrow(/per_night/);
  });

  it('leaves a hotel without coordinates without coordinates', () => {
    const listing = normalizeHotels({
      hotels: [
        {
          hotel_id: '1',
          name: 'Отель',
          location: { lat: null, lng: null },
          best_offer: { price: { amount: 1000, currency: 'RUB' }, price_basis: 'stay_total' },
        },
      ],
    });

    expect(listing.hotels[0]?.location).toBeUndefined();
  });
});

describe('normalizeCheckout', () => {
  it('reads the kind Tutu returned for a hotel page', () => {
    expect(normalizeCheckout(loadPayload('tutu/checkout-hotel-page.json')).kind).toBe('deeplink');
  });

  it('reads the kind Tutu returned for a real cart', () => {
    expect(normalizeCheckout(loadPayload('tutu/checkout-hotel-cart.json')).kind).toBe(
      'checkout_deeplink',
    );
  });

  it('keeps the link itself', () => {
    expect(normalizeCheckout(loadPayload('tutu/checkout-rail.json')).url).toMatch(/^https:\/\//);
  });

  it('falls back to the search results url when there is no other fallback', () => {
    const answer = normalizeCheckout({
      kind: 'search_redirect',
      search_results_url: 'https://avia.tutu.ru/f/',
    });

    expect(answer.fallbackUrl).toBe('https://avia.tutu.ru/f/');
  });

  it('reports a missing kind as missing rather than guessing one', () => {
    expect(normalizeCheckout({ checkout_url: 'https://tutu.ru' }).kind).toBeUndefined();
  });
});
