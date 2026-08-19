/**
 * Which events are worth a trip, and what the catalogue can honestly claim about itself.
 *
 * A topic answers with dozens of events and each one costs several seconds of transport and
 * hotel lookups, so the list is narrowed first. Everything dropped is reported with a reason,
 * including the events that were fine but fell past the cap: an event that vanishes without
 * explanation reads as a bug, and the two commonest cases (the event is online, the event is
 * at home) are not failures at all.
 *
 * Pure and clock-free. "Today" arrives as an argument, otherwise the answer would change on
 * its own overnight and every test with it. Specified in `specs/04-kompozitor.md`, step 1.
 */
import { computeStayDates } from './dates.ts';
import type {
  CatalogueEvent,
  CityDirectory,
  CoverageNote,
  EventRef,
  IsoDate,
  ResolvedCity,
  SkipReason,
  SkippedNote,
} from './types.ts';

const MAX_CANDIDATES = 5;
const BUSIEST_CITIES_SHOWN = 3;

/** Why the traveller is looking at nothing. Absent when a trip was found. */
export type EmptyReason =
  | 'catalogue-empty'
  | 'all-online'
  | 'all-in-origin-city'
  | 'all-unreachable'
  | 'all-outside-window'
  | 'all-without-destination'
  | 'all-unreadable'
  | 'nothing-left';

export type SelectionInput = {
  readonly events: readonly CatalogueEvent[];
  readonly origin: ResolvedCity;
  /** The reference day. Never `Date.now()`: this layer has no clock. */
  readonly asOf: IsoDate;
  readonly dateFrom?: IsoDate;
  readonly dateTo?: IsoDate;
};

export type SelectionResult = {
  /** The one event a full trip is assembled for. */
  readonly primary?: CatalogueEvent;
  /** Listed for the traveller to pick from, deliberately not computed. */
  readonly alternatives: readonly CatalogueEvent[];
  readonly skipped: readonly SkippedNote[];
  readonly emptyReason?: EmptyReason;
};

function toRef(event: CatalogueEvent): EventRef {
  return {
    id: event.id,
    title: event.title,
    ...(event.url === undefined ? {} : { url: event.url }),
  };
}

/** "Москва" and "москва " are the same place; "Московская область" is not. */
function sameCity(event: CatalogueEvent, origin: ResolvedCity): boolean {
  const fold = (value: string): string => value.trim().toLowerCase().replaceAll('ё', 'е');

  if (event.citySlug !== undefined && fold(event.citySlug) === fold(origin.slug)) return true;
  return event.city !== undefined && fold(event.city) === fold(origin.title);
}

const EMPTY_REASON_OF: Readonly<Record<SkipReason, EmptyReason>> = {
  online: 'all-online',
  'origin-city': 'all-in-origin-city',
  'no-destination': 'all-without-destination',
  unreachable: 'all-unreachable',
  'outside-window': 'all-outside-window',
  unreadable: 'all-unreadable',
  // Unreachable in practice: something got past the cap, so something was offered.
  'over-the-cap': 'nothing-left',
};

function emptyReasonFor(
  events: readonly CatalogueEvent[],
  skipped: readonly SkippedNote[],
): EmptyReason {
  if (events.length === 0) return 'catalogue-empty';
  if (skipped.length === 1) return EMPTY_REASON_OF[(skipped[0] as SkippedNote).reason];
  // Several reasons at once: naming one of them would tell the traveller something untrue.
  return 'nothing-left';
}

/** Reported in a fixed order rather than in the order the catalogue happened to be walked. */
const REPORTING_ORDER: readonly SkipReason[] = [
  'online',
  'origin-city',
  'no-destination',
  'unreachable',
  'outside-window',
  'unreadable',
  'over-the-cap',
];

export function selectEvents(input: SelectionInput): SelectionResult {
  const dropped = new Map<SkipReason, EventRef[]>();
  const drop = (reason: SkipReason, event: CatalogueEvent): void => {
    const bucket = dropped.get(reason) ?? [];
    bucket.push(toRef(event));
    dropped.set(reason, bucket);
  };

  const kept: CatalogueEvent[] = [];
  for (const event of input.events) {
    if (event.format === 'online') {
      drop('online', event);
      continue;
    }
    if (event.city === undefined && event.citySlug === undefined) {
      // Offline with nowhere named. There is no destination to search transport or hotels for.
      drop('no-destination', event);
      continue;
    }
    if (sameCity(event, input.origin)) {
      drop('origin-city', event);
      continue;
    }
    if (
      (input.dateFrom !== undefined && event.startDate < input.dateFrom) ||
      (input.dateTo !== undefined && event.startDate > input.dateTo)
    ) {
      drop('outside-window', event);
      continue;
    }

    let checkIn: IsoDate;
    try {
      checkIn = computeStayDates(event).checkIn;
    } catch {
      // One self-contradictory record must not take the rest of the catalogue down with it.
      drop('unreadable', event);
      continue;
    }

    // Not "has it started" but "can it still be reached": a conference opening tomorrow
    // morning wants the traveller in town tonight, and a hotel cannot be booked for yesterday.
    if (checkIn < input.asOf) {
      drop('unreachable', event);
      continue;
    }
    kept.push(event);
  }

  // Nearest first, ties broken by catalogue id so the same catalogue never answers two ways.
  const ordered = [...kept].sort(
    (left, right) => left.startDate.localeCompare(right.startDate) || left.id - right.id,
  );
  const candidates = ordered.slice(0, MAX_CANDIDATES);

  // Everything past the cap is still accounted for. Silently truncating a list reads as
  // "that is all there is", which is a different and false statement.
  for (const event of ordered.slice(MAX_CANDIDATES)) drop('over-the-cap', event);

  const skipped: SkippedNote[] = REPORTING_ORDER.filter((reason) => dropped.has(reason)).map(
    (reason) => ({ reason, events: dropped.get(reason) as EventRef[] }),
  );

  const [primary, ...alternatives] = candidates;
  return {
    ...(primary === undefined ? {} : { primary }),
    alternatives,
    skipped,
    ...(primary === undefined ? { emptyReason: emptyReasonFor(input.events, skipped) } : {}),
  };
}

/**
 * Counts are only claimed for what was actually seen. A single page of a paginated directory
 * cannot say how many cities have events, and reporting a page figure as a catalogue figure
 * would understate the coverage by whatever the page size happened to be.
 */
export function describeCoverage(directory: CityDirectory): CoverageNote {
  const whole = directory.cities.length >= directory.citiesTotal;
  if (!whole) {
    return {
      citiesListed: directory.citiesTotal,
      busiestCities: [],
      onlineEvents: directory.onlineEvents,
      countsCoverWholeDirectory: false,
    };
  }

  const withEvents = directory.cities.filter((city) => city.upcomingEvents > 0);
  return {
    citiesListed: directory.citiesTotal,
    citiesWithEvents: withEvents.length,
    busiestCities: [...withEvents]
      .sort(
        (left, right) =>
          right.upcomingEvents - left.upcomingEvents || left.slug.localeCompare(right.slug),
      )
      .slice(0, BUSIEST_CITIES_SHOWN),
    onlineEvents: directory.onlineEvents,
    countsCoverWholeDirectory: true,
  };
}
