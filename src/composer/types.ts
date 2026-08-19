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
