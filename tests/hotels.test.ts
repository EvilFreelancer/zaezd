import { describe, expect, it } from 'vitest';
import { distanceBetween, rankHotels } from '../src/composer/hotels.ts';
import type { HotelOffer, VenueLocation } from '../src/composer/types.ts';

const VENUE: VenueLocation = { precision: 'exact', lat: 56.8382, lng: 60.6104 };

function hotel(overrides: Partial<HotelOffer> & { id: string }): HotelOffer {
  return {
    name: `Отель ${overrides.id}`,
    price: { amount: 10000, currency: 'RUB' },
    location: { lat: 56.8382, lng: 60.6104 },
    ...overrides,
  };
}

describe('distanceBetween', () => {
  it('is zero for a point and itself', () => {
    expect(distanceBetween({ lat: 56.8382, lng: 60.6104 }, { lat: 56.8382, lng: 60.6104 })).toBe(0);
  });

  it('measures a known city-scale distance', () => {
    // Yekaterinburg city centre to the recorded venue address, about 600 m apart.
    const metres = distanceBetween(
      { lat: 56.8382071, lng: 60.6007886 },
      { lat: 56.8381978, lng: 60.6103939 },
    );

    expect(metres).toBeGreaterThan(500);
    expect(metres).toBeLessThan(700);
  });

  it('is symmetric', () => {
    const there = distanceBetween({ lat: 55.75, lng: 37.62 }, { lat: 56.84, lng: 60.6 });
    const back = distanceBetween({ lat: 56.84, lng: 60.6 }, { lat: 55.75, lng: 37.62 });

    expect(there).toBe(back);
  });
});

describe('rankHotels with a precise venue', () => {
  const near = hotel({ id: 'near', location: { lat: 56.8382, lng: 60.6104 } });
  const middle = hotel({ id: 'middle', location: { lat: 56.8482, lng: 60.6104 } });
  const far = hotel({ id: 'far', location: { lat: 56.9382, lng: 60.6104 } });

  it('puts the nearest hotel first', () => {
    const ranking = rankHotels({ hotels: [far, near, middle], venue: VENUE });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['near', 'middle', 'far']);
  });

  it('says it ranked by distance', () => {
    expect(rankHotels({ hotels: [near], venue: VENUE }).rankedBy).toBe('distance');
  });

  it('carries the distance for every hotel it could measure', () => {
    const ranking = rankHotels({ hotels: [near, middle], venue: VENUE });

    expect(ranking.hotels.every((entry) => entry.distanceM !== undefined)).toBe(true);
  });

  it('shows three hotels and no more', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      hotel({ id: `h${index}`, location: { lat: 56.8382 + index / 1000, lng: 60.6104 } }),
    );

    expect(rankHotels({ hotels: many, venue: VENUE }).hotels).toHaveLength(3);
  });

  it('does not treat a hotel without coordinates as the nearest one', () => {
    const unknown = hotel({ id: 'unknown' });
    delete (unknown as { location?: unknown }).location;

    const ranking = rankHotels({ hotels: [unknown, far], venue: VENUE });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['far', 'unknown']);
  });

  it('leaves the distance off a hotel it could not measure', () => {
    const unknown = hotel({ id: 'unknown' });
    delete (unknown as { location?: unknown }).location;

    const ranking = rankHotels({ hotels: [unknown], venue: VENUE });

    expect(ranking.hotels[0]?.distanceM).toBeUndefined();
  });

  it('breaks a distance tie by price, then rating, then id', () => {
    const cheap = hotel({ id: 'a', price: { amount: 5000, currency: 'RUB' } });
    const pricey = hotel({ id: 'b', price: { amount: 9000, currency: 'RUB' } });

    const ranking = rankHotels({ hotels: [pricey, cheap], venue: VENUE });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['a', 'b']);
  });

  it('answers the same whichever order the listing arrived in', () => {
    const listing = [far, near, middle];

    expect(rankHotels({ hotels: listing, venue: VENUE })).toEqual(
      rankHotels({ hotels: [...listing].reverse(), venue: VENUE }),
    );
  });
});

describe('rankHotels without a precise venue', () => {
  const cheap = hotel({ id: 'cheap', price: { amount: 5000, currency: 'RUB' }, rating: 7 });
  const pricey = hotel({ id: 'pricey', price: { amount: 9000, currency: 'RUB' }, rating: 9 });

  it('claims no distance when the venue was never found', () => {
    const ranking = rankHotels({ hotels: [cheap, pricey], venue: { precision: 'unknown' } });

    expect(ranking.hotels.every((entry) => entry.distanceM === undefined)).toBe(true);
  });

  it('claims no distance from a city centre either', () => {
    // A city centre is not a venue. "800 m from the centre" shown as "800 m from the
    // conference" is the same class of lie as an invented field.
    const ranking = rankHotels({
      hotels: [cheap, pricey],
      venue: { precision: 'city', lat: 56.8382071, lng: 60.6007886 },
    });

    expect(ranking.hotels.every((entry) => entry.distanceM === undefined)).toBe(true);
  });

  it('ranks by price, then by rating', () => {
    const ranking = rankHotels({ hotels: [pricey, cheap], venue: { precision: 'unknown' } });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['cheap', 'pricey']);
  });

  it('does not treat a missing rating as a bad one', () => {
    const unrated = hotel({ id: 'unrated', price: { amount: 5000, currency: 'RUB' } });
    const rated = hotel({ id: 'rated', price: { amount: 5000, currency: 'RUB' }, rating: 4 });

    const ranking = rankHotels({ hotels: [unrated, rated], venue: { precision: 'unknown' } });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['rated', 'unrated']);
  });

  it('says it ranked by price and rating', () => {
    expect(rankHotels({ hotels: [cheap], venue: { precision: 'unknown' } }).rankedBy).toBe(
      'price-and-rating',
    );
  });
});

describe('rankHotels and the price ceiling', () => {
  const cheap = hotel({ id: 'cheap', price: { amount: 5000, currency: 'RUB' } });
  const pricey = hotel({ id: 'pricey', price: { amount: 25000, currency: 'RUB' } });

  it('drops a hotel above the ceiling', () => {
    const ranking = rankHotels({ hotels: [cheap, pricey], venue: VENUE, maxStayPrice: 10000 });

    expect(ranking.hotels.map((entry) => entry.hotel.id)).toEqual(['cheap']);
  });

  it('keeps a hotel priced exactly at the ceiling', () => {
    const ranking = rankHotels({ hotels: [cheap], venue: VENUE, maxStayPrice: 5000 });

    expect(ranking.hotels).toHaveLength(1);
  });

  it('shows the hotels anyway when nothing meets the ceiling', () => {
    const ranking = rankHotels({ hotels: [cheap, pricey], venue: VENUE, maxStayPrice: 1 });

    expect(ranking.hotels).toHaveLength(2);
  });

  it('says out loud that the ceiling could not be met', () => {
    const ranking = rankHotels({ hotels: [cheap, pricey], venue: VENUE, maxStayPrice: 1 });

    expect(ranking.priceCeilingUnmet).toBe(true);
  });

  it('does not claim an unmet ceiling when there was none', () => {
    expect(rankHotels({ hotels: [cheap], venue: VENUE }).priceCeilingUnmet).toBe(false);
  });

  it('returns nothing for an empty listing instead of failing', () => {
    expect(rankHotels({ hotels: [], venue: VENUE }).hotels).toEqual([]);
  });
});
