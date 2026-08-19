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
