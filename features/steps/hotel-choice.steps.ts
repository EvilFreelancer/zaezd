import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { rankHotels, type HotelRanking } from '../../src/composer/hotels.ts';
import type { HotelOffer, VenueLocation } from '../../src/composer/types.ts';
import type { ZaezdWorld } from '../support/world.ts';

Given('one recorded hotel has no coordinates', function (this: ZaezdWorld) {
  const hotels = this.recall<HotelOffer[]>('hotels');
  const [first, ...rest] = hotels;
  assert.ok(first !== undefined, 'the recorded listing is empty');

  const withoutLocation: HotelOffer = {
    id: first.id,
    name: first.name,
    price: first.price,
    ...(first.stars === undefined ? {} : { stars: first.stars }),
    ...(first.rating === undefined ? {} : { rating: first.rating }),
  };
  this.remember('hotel-without-coordinates', withoutLocation.id);
  this.remember('hotels', [withoutLocation, ...rest]);
});

Given('the venue is at {float}, {float}', function (this: ZaezdWorld, lat: number, lng: number) {
  this.remember('venue', { precision: 'exact', lat, lng } satisfies VenueLocation);
});

Given('the venue is only known to be somewhere in the city', function (this: ZaezdWorld) {
  this.remember('venue', { precision: 'city', lat: 56.8382071, lng: 60.6007886 } satisfies VenueLocation);
});

Given('the venue address could not be found', function (this: ZaezdWorld) {
  this.remember('venue', { precision: 'unknown' } satisfies VenueLocation);
});

Given(
  'the traveller will not pay more than {float} ₽ for the stay',
  function (this: ZaezdWorld, maxStayPrice: number) {
    this.remember('maxStayPrice', maxStayPrice);
  },
);

function rank(world: ZaezdWorld, hotels?: readonly HotelOffer[]): HotelRanking {
  return rankHotels({
    hotels: hotels ?? world.recall<HotelOffer[]>('hotels'),
    venue: world.recall<VenueLocation>('venue'),
    ...(world.scratch.has('maxStayPrice')
      ? { maxStayPrice: world.recall<number>('maxStayPrice') }
      : {}),
  });
}

When('the hotels are ranked', function (this: ZaezdWorld) {
  this.remember('ranking', rank(this));
});

When(
  'the hotels are ranked, and ranked again in the opposite order',
  function (this: ZaezdWorld) {
    const hotels = this.recall<HotelOffer[]>('hotels');
    this.remember('rankings', [rank(this, hotels), rank(this, [...hotels].reverse())]);
  },
);

function ranking(world: ZaezdWorld): HotelRanking {
  return world.recall<HotelRanking>('ranking');
}

Then('every hotel shown carries its distance to the venue', function (this: ZaezdWorld) {
  const { hotels } = ranking(this);
  assert.ok(hotels.length > 0);
  assert.ok(hotels.every((entry) => entry.distanceM !== undefined));
});

Then('the hotels are ordered from nearest to furthest', function (this: ZaezdWorld) {
  const distances = ranking(this).hotels.map((entry) => entry.distanceM ?? Number.POSITIVE_INFINITY);
  assert.deepEqual(distances, [...distances].sort((left, right) => left - right));
});

Then('{int} hotels are shown', function (this: ZaezdWorld, count: number) {
  assert.equal(ranking(this).hotels.length, count);
});

Then('no hotels are shown', function (this: ZaezdWorld) {
  assert.deepEqual(ranking(this).hotels, []);
});

Then('no hotel shows a distance', function (this: ZaezdWorld) {
  assert.ok(ranking(this).hotels.every((entry) => entry.distanceM === undefined));
});

Then('the hotels are ordered by price and rating', function (this: ZaezdWorld) {
  assert.equal(ranking(this).rankedBy, 'price-and-rating');
  const prices = ranking(this).hotels.map((entry) => entry.hotel.price.amount);
  assert.deepEqual(prices, [...prices].sort((left, right) => left - right));
});

Then('the hotel with no coordinates shows no distance', function (this: ZaezdWorld) {
  const id = this.recall<string>('hotel-without-coordinates');
  const entry = ranking(this).hotels.find((item) => item.hotel.id === id);
  assert.equal(entry?.distanceM, undefined);
});

Then('it is not ordered as though it were next door', function (this: ZaezdWorld) {
  const id = this.recall<string>('hotel-without-coordinates');
  const { hotels } = ranking(this);
  const position = hotels.findIndex((item) => item.hotel.id === id);
  const measured = hotels.filter((item) => item.distanceM !== undefined).length;
  assert.ok(position === -1 || position >= measured);
});

Then('no hotel shown costs more than {float} ₽', function (this: ZaezdWorld, ceiling: number) {
  assert.ok(ranking(this).hotels.every((entry) => entry.hotel.price.amount <= ceiling));
});

Then('the answer says the price ceiling could not be met', function (this: ZaezdWorld) {
  assert.equal(ranking(this).priceCeilingUnmet, true);
});

Then('both shortlists are identical', function (this: ZaezdWorld) {
  const [first, second] = this.recall<HotelRanking[]>('rankings');
  assert.deepEqual(second, first);
});
