import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { TtlCache } from '../../src/sources/cache.ts';
import { loadRecordings } from '../../src/sources/replay.ts';
import { replayHttp, type HttpFetch } from '../../src/enrich/http.ts';
import { loadCalendar } from '../../src/enrich/calendar.ts';
import { locateVenue, walkingMinutes } from '../../src/enrich/geo.ts';
import { forecastFor, type DayForecast } from '../../src/enrich/weather.ts';
import type { GeoPoint, IsoDate, VenueLocation } from '../../src/composer/types.ts';
import type { ZaezdWorld } from '../support/world.ts';

/**
 * Where the product actually asks about, which is where the geocoder put the venue: the street
 * address in Yekaterinburg, the city centre in Kazan where the catalogue named no venue.
 */
const CITIES: Readonly<Record<string, GeoPoint>> = {
  Екатеринбург: { lat: 56.8381978, lng: 60.6103939 },
  Казань: { lat: 55.7946485, lng: 49.1115022 },
};

type Wiring = { readonly http: HttpFetch; readonly cache: TtlCache };

function wiring(world: ZaezdWorld): Wiring {
  return world.recall<Wiring>('enrich');
}

Given('the optional sources are wired to the recordings', function (this: ZaezdWorld) {
  const recordings = loadRecordings();
  const cache = new TtlCache({ clock: () => 0 });

  // One recording set, four sources: the fixture manifest keys on the source name.
  const http: HttpFetch = async (url, args) => {
    const source = url.includes('nominatim')
      ? 'nominatim'
      : url.includes('routed-foot')
        ? 'osrm'
        : url.includes('isdayoff')
          ? 'isdayoff'
          : 'open-meteo';
    return replayHttp(source, recordings)(url, args);
  };

  this.remember('enrich', { http, cache });
});

Given('every optional source fails', function (this: ZaezdWorld) {
  this.remember('enrich', {
    http: async () => {
      throw new Error('the source did not answer');
    },
    cache: new TtlCache({ clock: () => 0 }),
  });
});

Given('only the city of the venue is known', function (this: ZaezdWorld) {
  const centre = CITIES['Екатеринбург'] as GeoPoint;
  this.remember('venue', { precision: 'city', ...centre } satisfies VenueLocation);
});

Given(
  'the venue is located precisely at {float}, {float}',
  function (this: ZaezdWorld, lat: number, lng: number) {
    this.remember('venue', { precision: 'exact', lat, lng } satisfies VenueLocation);
  },
);

When(
  'the venue {string} in {word} is located',
  async function (this: ZaezdWorld, venue: string, city: string) {
    this.remember('venue', await locateVenue(wiring(this), venue, city));
  },
);

When('a venue nobody named in {word} is located', async function (this: ZaezdWorld, city: string) {
  this.remember('venue', await locateVenue(wiring(this), undefined, city));
});

When('a venue nobody named in no city is located', async function (this: ZaezdWorld) {
  this.remember('venue', await locateVenue(wiring(this), undefined, undefined));
});

When(
  'the walk from a hotel at {float}, {float} is measured',
  async function (this: ZaezdWorld, lat: number, lng: number) {
    this.remember(
      'walk',
      await walkingMinutes(wiring(this), { lat, lng }, this.recall<VenueLocation>('venue')),
    );
  },
);

When('the walk from a hotel is measured', async function (this: ZaezdWorld) {
  this.remember(
    'walk',
    await walkingMinutes(
      wiring(this),
      { lat: 56.85621, lng: 60.60571 },
      this.recall<VenueLocation>('venue'),
    ),
  );
});

When(
  'the calendar is read for {word} to {word}',
  async function (this: ZaezdWorld, from: string, to: string) {
    this.remember('calendar', await loadCalendar(wiring(this), from, to));
  },
);

When(
  'the forecast is asked for {word} from {word} to {word}',
  async function (this: ZaezdWorld, city: string, from: string, to: string) {
    const where = CITIES[city];
    assert.ok(where !== undefined, `nobody recorded coordinates for ${city}`);
    this.remember('forecast', await forecastFor(wiring(this), where, from, to, city));
  },
);

Then('the venue is located precisely', function (this: ZaezdWorld) {
  assert.equal(this.recall<VenueLocation>('venue').precision, 'exact');
});

Then('the venue is known only as a city', function (this: ZaezdWorld) {
  assert.equal(this.recall<VenueLocation>('venue').precision, 'city');
});

Then('the venue is not located', function (this: ZaezdWorld) {
  assert.equal(this.recall<VenueLocation>('venue').precision, 'unknown');
});

Then('no walking time is given', function (this: ZaezdWorld) {
  assert.equal(this.recall<number | undefined>('walk'), undefined);
});

Then('the walk is {int} minutes', function (this: ZaezdWorld, minutes: number) {
  assert.equal(this.recall<number | undefined>('walk'), minutes);
});

function calendar(world: ZaezdWorld): Readonly<Record<IsoDate, boolean>> {
  const marked = world.recall<Readonly<Record<IsoDate, boolean>> | undefined>('calendar');
  assert.ok(marked !== undefined, 'the calendar did not answer');
  return marked;
}

Then('{word} is a working day', function (this: ZaezdWorld, day: string) {
  assert.equal(calendar(this)[day], true);
});

Then('{word} is not a working day', function (this: ZaezdWorld, day: string) {
  assert.equal(calendar(this)[day], false);
});

Then('no calendar is given', function (this: ZaezdWorld) {
  assert.equal(this.recall<unknown>('calendar'), undefined);
});

Then('a forecast for {int} days is given', function (this: ZaezdWorld, days: number) {
  assert.equal(this.recall<readonly DayForecast[] | undefined>('forecast')?.length, days);
});

Then('no forecast is given', function (this: ZaezdWorld) {
  assert.equal(this.recall<unknown>('forecast'), undefined);
});
