/**
 * Turning a venue string into a point, and refusing to pretend when it is not one.
 *
 * The catalogue has no coordinates. `venue` is free text and the real values look like "РУДН,
 * Москва", "YADRO", "Городской молодёжный кластер «Салют», ул. Толмачёва, 12", or nothing at
 * all. Geocoding is mandatory and it fails often, so the ladder descends in precision and the
 * result says which rung it stopped on.
 *
 * Measured on the recorded fixtures: the venue string exactly as the catalogue writes it
 * returns nothing at all, the address pulled out of it returns four hits, and a company name
 * returns something plausible and nearly meaningless. Falling back to the city centre is a
 * normal mode of operation, not an exception - and a city centre is never called a venue.
 */
import { TTL, cacheKey, type TtlCache } from '../sources/cache.ts';
import { optional, type HttpFetch } from './http.ts';
import type { GeoPoint, VenueLocation } from '../composer/types.ts';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** The public demo OSRM serves the car profile only, and a car route is not a walk. */
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

export type GeoOptions = {
  readonly http: HttpFetch;
  readonly cache: TtlCache;
};

type NominatimHit = { readonly lat?: string; readonly lon?: string };

function toPoint(body: unknown): GeoPoint | undefined {
  const first = Array.isArray(body) ? (body[0] as NominatimHit | undefined) : undefined;
  if (first?.lat === undefined || first.lon === undefined) return undefined;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

async function lookUp(options: GeoOptions, query: string): Promise<GeoPoint | undefined> {
  const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const args = { tool: 'search', q: query };

  return optional(async () =>
    options.cache.through(cacheKey('nominatim', 'search', { url, ...args }), TTL.geocoding, async () => {
      const answer = await options.http(url, args);
      return answer.status === 200 ? toPoint(answer.body) : undefined;
    }),
  );
}

/**
 * The address inside a venue string, when there is one.
 *
 * "Городской молодёжный кластер «Салют», ул. Толмачёва, 12" resolves to nothing as written and
 * to the right building once the street and number are pulled out of it.
 */
export function addressPart(venue: string): string | undefined {
  const kinds =
    'ул\\.|улица|наб\\.|набережная|пр\\.|проспект|просп\\.|пер\\.|переулок|ш\\.|шоссе|' +
    'пл\\.|площадь|б-р|бульвар|линия|тракт|аллея|проезд';
  const match = new RegExp(`((?:${kinds})[^,]*,\\s*\\d+[^,]*)`, 'iu').exec(venue);
  return match?.[1]?.trim();
}

/**
 * Where the event is, and how sure anyone is about it.
 *
 * Three rungs, in order: the venue as written, the address pulled out of it, the city. `exact`
 * is earned only by a string that actually carries a street and a number - a geocoder happily
 * resolves a company name to its head office, and a head office is not a conference hall. A
 * name hit is `approximate`: worth saying, not worth a pin or a walking time.
 */
export async function locateVenue(
  options: GeoOptions,
  venue: string | undefined,
  city: string | undefined,
): Promise<VenueLocation> {
  if (venue !== undefined && city !== undefined) {
    const address = addressPart(venue);
    const precise = await lookUp(options, `${venue}, ${city}`);
    if (precise !== undefined) {
      return { precision: address === undefined ? 'approximate' : 'exact', ...precise };
    }

    if (address !== undefined) {
      const byAddress = await lookUp(options, `${address}, ${city}`);
      if (byAddress !== undefined) return { precision: 'exact', ...byAddress };
    }
  }

  if (city !== undefined) {
    const centre = await lookUp(options, city);
    if (centre !== undefined) return { precision: 'city', ...centre };
  }

  return { precision: 'unknown' };
}

type OsrmAnswer = { readonly code?: string; readonly routes?: readonly { duration?: number }[] };

/**
 * Minutes on foot, or nothing.
 *
 * Only from the foot profile, and only from a venue that was located precisely. Measured on one
 * pair of points in Kazan the car profile answered 269 s where the foot profile answered 847 s;
 * a car route relabelled "N мин пешком" is the same class of lie as an invented field.
 */
export async function walkingMinutes(
  options: GeoOptions,
  from: GeoPoint,
  venue: VenueLocation,
): Promise<number | undefined> {
  if (venue.precision !== 'exact') return undefined;

  const pair = `${from.lng},${from.lat};${venue.lng},${venue.lat}`;
  const url = `${OSRM_FOOT}/${pair}?overview=false`;
  const args = { tool: 'route-foot', profile: 'foot' };

  return optional(async () =>
    options.cache.through(cacheKey('osrm', 'route-foot', { url, ...args }), TTL.geocoding, async () => {
      const answer = await options.http(url, args);
      if (answer.status !== 200) return undefined;

      const route = answer.body as OsrmAnswer;
      if (route.code !== 'Ok') return undefined;

      const seconds = route.routes?.[0]?.duration;
      return typeof seconds === 'number' ? Math.round(seconds / 60) : undefined;
    }),
  );
}
