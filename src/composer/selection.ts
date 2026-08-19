/**
 * Which events are worth a trip, and what the catalogue can honestly claim about itself.
 *
 * A topic answers with dozens of events and each one costs several seconds of transport and
 * hotel lookups, so the list is narrowed first. Everything dropped is reported with a reason:
 * an event that vanishes without explanation reads as a bug, and the two commonest cases
 * (the event is online, the event is at home) are not failures at all.
 *
 * Pure and clock-free. "Today" arrives as an argument, otherwise the answer would change on
 * its own overnight and every test with it. Specified in `specs/04-kompozitor.md`, step 1.
 */
import { computeStayDates } from './dates.ts';
import type { CatalogueEvent, IsoDate, ResolvedCity } from './types.ts';

const MAX_CANDIDATES = 5;
const BUSIEST_CITIES_SHOWN = 3;

export type SkipReason = 'online' | 'origin-city' | 'unreachable' | 'outside-window';

export type EventRef = {
  readonly id: number;
  readonly title: string;
};

export type SkippedNote = {
  readonly reason: SkipReason;
  readonly events: readonly EventRef[];
};

/** Why the traveller is looking at nothing. Absent when a trip was found. */
export type EmptyReason =
  | 'catalogue-empty'
  | 'all-online'
  | 'all-in-origin-city'
  | 'all-unreachable'
  | 'all-outside-window'
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

export type CityCount = {
  readonly slug: string;
  readonly title: string;
  readonly events_count: number;
};

export type CityDirectory = {
  readonly total: number;
  readonly online_count?: number;
  readonly items: readonly CityCount[];
};

export type CoverageNote = {
  readonly citiesListed: number;
  readonly citiesWithEvents: number;
  readonly busiestCities: readonly CityCount[];
  readonly onlineEvents: number;
  /** True when the directory arrived paginated, so the counts describe one page. */
  readonly pageIsPartial: boolean;
};

/** "Москва" and "москва " are the same place; "Московская область" is not. */
function sameCity(event: CatalogueEvent, origin: ResolvedCity): boolean {
  const fold = (value: string): string => value.trim().toLowerCase().replaceAll('ё', 'е');

  if (event.citySlug !== undefined && fold(event.citySlug) === fold(origin.slug)) return true;
  return event.city !== undefined && fold(event.city) === fold(origin.title);
}

const EMPTY_REASON_OF: Readonly<Record<SkipReason, EmptyReason>> = {
  online: 'all-online',
  'origin-city': 'all-in-origin-city',
  unreachable: 'all-unreachable',
  'outside-window': 'all-outside-window',
};

function emptyReasonFor(
  events: readonly CatalogueEvent[],
  skipped: readonly SkippedNote[],
): EmptyReason {
  if (events.length === 0) return 'catalogue-empty';
  if (skipped.length === 1) {
    const only = skipped[0] as SkippedNote;
    return EMPTY_REASON_OF[only.reason];
  }
  // Several reasons at once: naming one of them would tell the traveller something untrue.
  return 'nothing-left';
}

export function selectEvents(input: SelectionInput): SelectionResult {
  const dropped = new Map<SkipReason, EventRef[]>();
  const drop = (reason: SkipReason, event: CatalogueEvent): void => {
    const bucket = dropped.get(reason) ?? [];
    bucket.push({ id: event.id, title: event.title });
    dropped.set(reason, bucket);
  };

  const kept: CatalogueEvent[] = [];
  for (const event of input.events) {
    if (event.format === 'online') {
      drop('online', event);
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
    // Not "has it started" but "can it still be reached": a conference opening tomorrow
    // morning wants the traveller in town tonight, and a hotel cannot be booked for yesterday.
    if (computeStayDates(event).checkIn < input.asOf) {
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

  // Reported in a fixed order rather than in the order the catalogue happened to be walked.
  const order: readonly SkipReason[] = ['online', 'origin-city', 'unreachable', 'outside-window'];
  const skipped: SkippedNote[] = order
    .filter((reason) => dropped.has(reason))
    .map((reason) => ({ reason, events: dropped.get(reason) as EventRef[] }));

  const [primary, ...alternatives] = candidates;
  return {
    ...(primary === undefined ? {} : { primary }),
    alternatives,
    skipped,
    ...(primary === undefined
      ? { emptyReason: emptyReasonFor(input.events, skipped) }
      : {}),
  };
}

export function describeCoverage(directory: CityDirectory): CoverageNote {
  const withEvents = directory.items.filter((city) => city.events_count > 0);
  const busiest = [...withEvents]
    .sort((left, right) => right.events_count - left.events_count || left.slug.localeCompare(right.slug))
    .slice(0, BUSIEST_CITIES_SHOWN);

  return {
    citiesListed: directory.total,
    citiesWithEvents: withEvents.length,
    busiestCities: busiest,
    onlineEvents: directory.online_count ?? 0,
    pageIsPartial: directory.items.length < directory.total,
  };
}
