/**
 * The vocabulary the whole product shares. It grows one feature at a time; publishing the
 * full domain in the first commit would mean a type nobody has exercised yet.
 */

/** A calendar day, `YYYY-MM-DD`. Never a `Date`: a day has no time zone and no clock. */
export type IsoDate = string;

/**
 * A moment written the way a source wrote it, ISO 8601 with an offset
 * (`2026-08-27T10:00:00+03:00`). The offset is part of the value and is never normalised
 * away, because "does the event open before noon" is a question about the local wall clock
 * and "does the traveller arrive in time" is a question about the instant.
 */
export type IsoDateTime = string;

/** What a source calls a place, after L3 has resolved the traveller's free-text origin. */
export type ResolvedCity = {
  readonly slug: string;
  readonly title: string;
};

export type EventFormat = 'offline' | 'online' | 'hybrid';

/**
 * One event from the catalogue, after normalization. A field the catalogue did not return
 * stays `undefined` all the way to the screen and is rendered as missing, never guessed.
 */
export type CatalogueEvent = {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly startsAt?: IsoDateTime;
  /** confcal never supplies this. It exists for a source that might. */
  readonly endsAt?: IsoDateTime;
  readonly city?: string;
  readonly citySlug?: string;
  /** Free text: "РУДН, Москва", "YADRO", or nothing at all. Never coordinates. */
  readonly venue?: string;
  readonly format: EventFormat;
  readonly isFree?: boolean;
  /** Free text too: "от 7 000 ₽", "бесплатно", "уточняется у организатора". */
  readonly price?: string;
  readonly topics: readonly string[];
};

/** A pointer back to an event the traveller was not offered, enough to show and link it. */
export type EventRef = {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
};

export type SkipReason =
  /** The event happens online; there is nothing to travel to. */
  | 'online'
  /** The event is in the city the traveller is already in. */
  | 'origin-city'
  /** Offline, but the catalogue named no city, so there is nowhere to send anyone. */
  | 'no-destination'
  /** The arrival day is already in the past. */
  | 'unreachable'
  /** Outside the dates the traveller asked for. */
  | 'outside-window'
  /** Fine, but past the cap on how many events are offered at once. */
  | 'over-the-cap'
  /** The catalogue record contradicts itself and cannot be read. */
  | 'unreadable';

export type SkippedNote = {
  readonly reason: SkipReason;
  readonly events: readonly EventRef[];
};

/** One city of the catalogue directory with its count of upcoming events. */
export type CityCount = {
  readonly slug: string;
  readonly title: string;
  readonly upcomingEvents: number;
};

export type CityDirectory = {
  /** How many cities the directory holds in total, which a single page may not show. */
  readonly citiesTotal: number;
  /** Upcoming events with no city to travel to. */
  readonly onlineEvents: number;
  readonly cities: readonly CityCount[];
};

/**
 * What the catalogue can honestly claim about itself. Empty cities are not hidden: live
 * offline events exist in a handful of cities and saying otherwise is the easiest lie to tell.
 */
export type CoverageNote = {
  readonly citiesListed: number;
  /** Absent when only one page of the directory was seen; a page cannot count the whole. */
  readonly citiesWithEvents?: number;
  readonly busiestCities: readonly CityCount[];
  readonly onlineEvents: number;
  readonly countsCoverWholeDirectory: boolean;
};
