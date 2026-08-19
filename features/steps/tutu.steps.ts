/**
 * Steps that put recorded Tutu answers on the World.
 *
 * Journeys and hotels are the raw material of more than one feature, and `strict: true` makes a
 * duplicated step a hard error rather than a coin toss, so they live here once.
 */
import assert from 'node:assert/strict';
import { Given } from '@cucumber/cucumber';
import type { HotelOffer } from '../../src/composer/types.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

export type RecordedVariant = {
  readonly transport: string;
  readonly departure_at: string;
  readonly arrival_at: string;
  readonly duration_min: number;
  readonly price: { readonly amount: number; readonly currency: string };
};

export type RecordedHotel = {
  readonly hotel_id: string;
  readonly name: string;
  readonly stars: number | null;
  readonly rating: number | null;
  readonly review_count: number | null;
  readonly address: string | null;
  readonly alias: string | null;
  readonly location: { lat: number | null; lng: number | null } | null;
  readonly photos: readonly string[] | null;
  readonly best_offer: {
    readonly price: { readonly amount: number; readonly currency: string };
    readonly price_basis: string;
  };
};

/** Field renaming only; `src/sources/normalize.ts` takes this over when it lands. */
export function asHotel(recorded: RecordedHotel): HotelOffer {
  const location = recorded.location;
  const point =
    location === null || location.lat === null || location.lng === null
      ? undefined
      : { lat: location.lat, lng: location.lng };

  return {
    id: recorded.hotel_id,
    name: recorded.name,
    price: recorded.best_offer.price,
    ...(recorded.stars === null ? {} : { stars: recorded.stars }),
    ...(recorded.rating === null ? {} : { rating: recorded.rating }),
    ...(recorded.review_count === null ? {} : { reviewCount: recorded.review_count }),
    ...(recorded.address === null ? {} : { address: recorded.address }),
    ...(recorded.alias === null ? {} : { alias: recorded.alias }),
    ...(point === undefined ? {} : { location: point }),
    ...(recorded.photos?.[0] === undefined ? {} : { photo: recorded.photos[0] }),
  };
}

/**
 * The fixtures are named by their role in the demo rather than by a city, because the demo is
 * derived from whatever the catalogue offers and the city changes with it.
 */
const JOURNEYS: Readonly<Record<string, string>> = {
  there: 'tutu/demo-out.json',
  home: 'tutu/demo-back.json',
};

Given('the recorded journeys {word}', function (this: ZaezdWorld, direction: string) {
  const fixture = JOURNEYS[direction];
  assert.ok(fixture !== undefined, `no recorded journeys "${direction}"`);

  const { variants } = loadPayload<{ variants: RecordedVariant[] }>(fixture);
  this.remember('variants', variants);
  this.remember(`journeys:${direction}`, variants);
});

Given('the recorded hotels of the demo trip', function (this: ZaezdWorld) {
  const { hotels } = loadPayload<{ hotels: RecordedHotel[] }>('tutu/demo-hotels.json');
  this.remember('recorded-hotels', hotels);
  this.remember('hotels', hotels.map(asHotel));
});

Given('the recorded listing has no hotels', function (this: ZaezdWorld) {
  this.remember('recorded-hotels', []);
  this.remember('hotels', []);
});
