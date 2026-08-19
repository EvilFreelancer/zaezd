/**
 * The orchestrator: everything the pure rules decide, wired to the sources that supply them.
 *
 * The shape of the work is fixed by measurement rather than taste. Both transport searches go
 * out together because they are independent and each costs seconds. Hotels need the dates, so
 * they wait for nothing else. The three optional sources run alongside and none of them can
 * hold the answer up or take it down.
 *
 * One event is assembled per request. Fanning out over five would be a spinner, not a product,
 * and the other four are listed for the traveller to pick from.
 *
 * Budgets and caps in `specs/04-kompozitor.md`; failure policy in `specs/07-nadezhnost.md`.
 */
import { computeStayDates, type StayDates } from './dates.ts';
import { checkFeasibility } from './feasibility.ts';
import { rankHotels, type RankedHotel } from './hotels.ts';
import { choosePackages, type PackageNote, type TripPackage, type TripVariant } from './packages.ts';
import { countWorkingDaysBurnt, parseEventPrice, priceTrip } from './pricing.ts';
import { describeCoverage, selectEvents, type EmptyReason } from './selection.ts';
import type {
  CatalogueEvent,
  CoverageNote,
  EventCard,
  IsoDate,
  IsoDateTime,
  Leg,
  ResolvedCity,
  SkippedNote,
  TransportSearch,
  TripRequest,
} from './types.ts';
import type { ConfcalClient } from '../sources/confcal.ts';
import type { TutuClient } from '../sources/tutu.ts';
import { SourceError, type SourceReason } from '../sources/normalize.ts';
import { loadCalendar, type CalendarOptions } from '../enrich/calendar.ts';
import { locateVenue, walkingMinutes, type GeoOptions } from '../enrich/geo.ts';
import { forecastFor, type DayForecast, type WeatherOptions } from '../enrich/weather.ts';

/** How many journeys each way go into the cartesian product. Six each way is 36 pairs. */
const LEGS_CONSIDERED = 6;

/** How many events to ask the catalogue for. See the note in `eventQueryFor`. */
const CANDIDATE_LIMIT = 8;
const HOTELS_CONSIDERED = 3;

export type Stage = 'events' | 'transport' | 'hotels' | 'context' | 'done';

/** Something a source could not do, said plainly rather than shown as an empty block. */
export type SourceNote = {
  readonly source: string;
  readonly what: 'transport-out' | 'transport-back' | 'hotels' | 'catalogue';
  /** Why it failed, as a code the delivery layer turns into a Russian sentence. */
  readonly reason: SourceReason;
  /** The English detail, for logs. The screen and the agent are shown the code instead. */
  readonly message: string;
};

export type TripResult = {
  readonly request: TripRequest;
  readonly event?: EventCard;
  readonly stay?: StayDates;
  readonly packages: readonly TripPackage[];
  /** Listed, deliberately not computed. */
  readonly alternatives: readonly CatalogueEvent[];
  readonly noTravelNeeded: readonly SkippedNote[];
  readonly coverage: CoverageNote;
  readonly notes: readonly PackageNote[];
  readonly sourceNotes: readonly SourceNote[];
  readonly emptyReason?: EmptyReason;
  readonly workingDaysCounted: boolean;
  readonly forecast?: readonly DayForecast[];
  readonly computedAt: IsoDateTime;
  readonly mode: 'live' | 'replay';
};

export type BuildTripOptions = {
  readonly confcal: ConfcalClient;
  readonly tutu: TutuClient;
  readonly geo: GeoOptions;
  readonly calendar: CalendarOptions;
  readonly weather: WeatherOptions;
  /** The reference day. In replay this is the day the fixtures were recorded. */
  readonly asOf: IsoDate;
  /** The moment stamped on the answer, so the screen can say when it was computed. */
  readonly computedAt: IsoDateTime;
  readonly mode: 'live' | 'replay';
  readonly onStage?: (stage: Stage) => void;
  /** The event a shared link named, so the link opens the trip it was made from. */
  readonly pinnedEventId?: number;
};

/**
 * What to ask the catalogue.
 *
 * Not "every offline event on this topic": Moscow alone holds 161 of them, so a plain query
 * with a sane limit comes back entirely full of events in the city the traveller already lives
 * in. The directory says which cities have events at all, so the question names them - minus
 * home - and the answer is made of events a trip could actually be built for.
 *
 * Exported because `scripts/record.ts` records exactly this query. A recording that answers a
 * different question than the product asks is a recording that will never be found.
 */
export function eventQueryFor(
  cities: readonly { readonly slug: string; readonly upcomingEvents: number }[],
  originSlug: string,
  request: Pick<TripRequest, 'topics' | 'dateFrom' | 'dateTo'>,
): {
  readonly cities: readonly string[];
  readonly topics: readonly string[];
  readonly format: 'offline';
  readonly limit: number;
  readonly dateFrom?: IsoDate;
  readonly dateTo?: IsoDate;
} {
  const worthAsking = cities
    .filter((city) => city.upcomingEvents > 0 && city.slug !== originSlug)
    .map((city) => city.slug)
    .sort();

  return {
    cities: worthAsking,
    topics: [...request.topics],
    format: 'offline',
    // Eight, not twenty. Measured from the deployment host: this catalogue stops emitting
    // mid-stream once the result set passes nine, and the call then hangs until it times out.
    // Five candidates are listed and one is computed, so eight is more than the screen uses.
    limit: CANDIDATE_LIMIT,
    ...(request.dateFrom === undefined ? {} : { dateFrom: request.dateFrom }),
    ...(request.dateTo === undefined ? {} : { dateTo: request.dateTo }),
  };
}

/** "Москва" and "moscow" name the same place; the directory is what knows that. */
function resolveOrigin(origin: string, coverage: CoverageNote): ResolvedCity {
  const fold = (value: string): string => value.trim().toLowerCase().replaceAll('ё', 'е');
  const wanted = fold(origin);

  const match = coverage.busiestCities.find(
    (city) => fold(city.slug) === wanted || fold(city.title) === wanted,
  );
  return match === undefined ? { slug: wanted, title: origin.trim() } : match;
}

function noteFor(error: unknown, source: string, what: SourceNote['what']): SourceNote {
  return {
    source,
    what,
    reason: error instanceof SourceError ? error.reason : 'unreachable',
    message: error instanceof SourceError ? error.message : 'did not answer',
  };
}

async function attempt<T>(
  work: Promise<T>,
  source: string,
  what: SourceNote['what'],
  notes: SourceNote[],
): Promise<T | undefined> {
  try {
    return await work;
  } catch (error) {
    notes.push(noteFor(error, source, what));
    return undefined;
  }
}

function bestLegs(search: TransportSearch | undefined): readonly Leg[] {
  return (search?.legs ?? []).slice(0, LEGS_CONSIDERED);
}

export async function buildTrip(
  request: TripRequest,
  options: BuildTripOptions,
): Promise<TripResult> {
  const sourceNotes: SourceNote[] = [];
  const stage = (name: Stage): void => options.onStage?.(name);

  const directory = await options.confcal.listCities();
  const coverage = describeCoverage(directory);
  const origin = resolveOrigin(request.origin, {
    ...coverage,
    // Origin resolution needs the whole directory, not just the busiest three.
    busiestCities: directory.cities,
  });

  const events = await options.confcal.searchEvents(
    eventQueryFor(directory.cities, origin.slug, request),
  );
  stage('events');

  const selection = selectEvents({
    events,
    origin,
    asOf: options.asOf,
    ...(request.dateFrom === undefined ? {} : { dateFrom: request.dateFrom }),
    ...(request.dateTo === undefined ? {} : { dateTo: request.dateTo }),
    ...(options.pinnedEventId === undefined ? {} : { pinnedEventId: options.pinnedEventId }),
  });

  const base = {
    request,
    alternatives: selection.alternatives,
    noTravelNeeded: selection.skipped,
    coverage,
    sourceNotes,
    computedAt: options.computedAt,
    mode: options.mode,
  };

  const primary = selection.primary;
  if (primary === undefined) {
    stage('done');
    return {
      ...base,
      packages: [],
      notes: [],
      workingDaysCounted: false,
      ...(selection.emptyReason === undefined ? {} : { emptyReason: selection.emptyReason }),
    };
  }

  const stay = computeStayDates(primary);
  const destination = primary.city ?? primary.citySlug ?? '';

  // Both directions at once: they are independent and each one costs seconds.
  const [outbound, back] = await Promise.all([
    attempt(
      options.tutu.searchTransport({
        origin: origin.title,
        destination,
        departureDate: stay.outboundDate,
        adults: request.adults,
      }),
      'tutu',
      'transport-out',
      sourceNotes,
    ),
    attempt(
      options.tutu.searchTransport({
        origin: destination,
        destination: origin.title,
        departureDate: stay.returnDate,
        adults: request.adults,
      }),
      'tutu',
      'transport-back',
      sourceNotes,
    ),
  ]);
  stage('transport');

  const hotels = stay.needsHotel
    ? await attempt(
        options.tutu.searchHotels({
          city: destination,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          adults: request.adults,
        }),
        'tutu',
        'hotels',
        sourceNotes,
      )
    : undefined;
  stage('hotels');

  // Optional context, all at once, none of it able to hold the answer up.
  const [venue, calendar] = await Promise.all([
    locateVenue(options.geo, primary.venue, primary.city),
    loadCalendar(options.calendar, stay.checkIn, stay.checkOut),
  ]);

  const ranking = rankHotels({
    hotels: hotels?.hotels ?? [],
    venue,
    ...(request.budget === undefined ? {} : { maxStayPrice: request.budget }),
    limit: HOTELS_CONSIDERED,
  });

  const nearest = ranking.hotels[0];
  const [walk, forecast] = await Promise.all([
    nearest?.hotel.location === undefined
      ? Promise.resolve(undefined)
      : walkingMinutes(options.geo, nearest.hotel.location, venue),
    venue.precision === 'unknown'
      ? Promise.resolve(undefined)
      : forecastFor(options.weather, venue, stay.checkIn, stay.checkOut, primary.city),
  ]);
  stage('context');

  const eventPrice = parseEventPrice(primary.price, primary.isFree);
  const variants: TripVariant[] = [];

  // The cartesian product, restricted to what is worth pricing at all.
  const roomChoices: readonly (RankedHotel | undefined)[] = stay.needsHotel
    ? ranking.hotels.length > 0
      ? ranking.hotels
      : [undefined]
    : [undefined];

  for (const there of bestLegs(outbound)) {
    for (const home of bestLegs(back)) {
      for (const room of roomChoices) {
        const burnt =
          calendar === undefined
            ? undefined
            : countWorkingDaysBurnt({
                outboundDepartureAt: there.departureAt,
                returnArrivalAt: home.arrivalAt,
                workingDays: calendar,
              });

        variants.push({
          id: `${there.offerId}|${home.offerId}|${room?.hotel.id ?? 'no-hotel'}`,
          outbound: there,
          back: home,
          ...(room === undefined ? {} : { hotel: room }),
          cost: priceTrip({
            outbound: there.price,
            back: home.price,
            ...(room === undefined ? {} : { hotel: room.hotel.price }),
            nights: stay.nights,
            eventPrice,
            ...(request.budget === undefined ? {} : { budget: request.budget }),
          }),
          feasibility: checkFeasibility({
            event: primary,
            arrivalAt: there.arrivalAt,
            returnDepartureAt: home.departureAt,
          }),
          totalDurationMin: there.durationMin + home.durationMin,
          ...(burnt === undefined ? {} : { workingDaysBurnt: burnt }),
        });
      }
    }
  }

  const chosen = choosePackages(variants);
  stage('done');

  const card: EventCard = {
    event: primary,
    venueLocation: venue,
    ...(walk === undefined ? {} : { walkingMinutes: walk }),
  };

  return {
    ...base,
    event: card,
    stay,
    packages: chosen.packages,
    notes: chosen.notes,
    workingDaysCounted: calendar !== undefined,
    ...(forecast === undefined ? {} : { forecast }),
    ...(variants.length === 0 ? { emptyReason: 'nothing-left' as EmptyReason } : {}),
  };
}

/**
 * At most three trips assembled at once per process.
 *
 * Each assembly fans out to six sources, so a handful of concurrent requests is enough to take
 * a public server down by accident. The rest wait rather than pile on.
 */
export function limitConcurrency(max: number): <T>(work: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];

  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}
