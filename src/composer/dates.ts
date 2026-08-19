/**
 * How long the traveller stays, decided from the event alone.
 *
 * Three identical live runs of one request produced three different night counts and a hotel
 * price spread of one and a half times, which is why this is arithmetic in a pure function
 * rather than a judgement a model makes afresh every time. No clock, no time zone of the
 * machine, no I/O: the same event always answers the same way.
 *
 * Specified in `specs/04-kompozitor.md`, step 2.
 */
import type { IsoDate, IsoDateTime } from './types.ts';

/** Everything the stay depends on. `endsAt` exists for a source that supplies it; confcal does not. */
export type EventSchedule = {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
};

export type StayDates = {
  readonly checkIn: IsoDate;
  readonly checkOut: IsoDate;
  /** The outbound journey is booked for the arrival day, the return for the departure day. */
  readonly outboundDate: IsoDate;
  readonly returnDate: IsoDate;
  readonly nights: number;
  /** Zero nights is a legal answer and means a same-day trip, not a missing hotel. */
  readonly needsHotel: boolean;
  readonly openingTimeKnown: boolean;
  readonly closingTimeKnown: boolean;
};

const MS_PER_DAY = 86_400_000;
const NOON_MINUTES = 12 * 60;
const EVENING_MINUTES = 18 * 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A whole ISO 8601 moment, anchored at both ends. Anchoring matters: a prefix match accepts
 * "2026-08-27T12:00junk" and would report a known opening time for a string nobody can read.
 * The offset is optional here because "before noon" is a wall-clock question; feasibility
 * asks for the instant separately and demands one.
 */
const TIME_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](?:0\d|1[0-4]):?[0-5]\d)?$/;

/** Days since the epoch. Calendar arithmetic runs in UTC so daylight saving cannot shift it. */
function toEpochDay(value: IsoDate): number {
  const parts = DATE_PATTERN.exec(value);
  if (parts === null) {
    throw new RangeError(`Not a calendar day in YYYY-MM-DD form: "${value}"`);
  }

  const [, year, month, day] = parts as unknown as [string, string, string, string];
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const roundTrip = new Date(utc);
  const exists =
    roundTrip.getUTCFullYear() === Number(year) &&
    roundTrip.getUTCMonth() === Number(month) - 1 &&
    roundTrip.getUTCDate() === Number(day);
  if (!exists) {
    throw new RangeError(`No such calendar day: "${value}"`);
  }

  return utc / MS_PER_DAY;
}

function toIsoDate(epochDay: number): IsoDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Minutes since local midnight, read straight off the string.
 *
 * The offset is deliberately ignored here. "Does the event open before noon" is a question
 * about the wall clock at the venue, and 11:00-03:00 is eleven in the morning there whatever
 * that is in UTC. Converting first would move a morning conference into the afternoon and
 * send the traveller a day late.
 */
function localMinutes(value: IsoDateTime | undefined): number | undefined {
  if (value === undefined) return undefined;

  const parts = TIME_PATTERN.exec(value);
  if (parts === null) return undefined;

  const [, , , hours, minutes, seconds] = parts as unknown as [
    string,
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  if (Number(hours) > 23 || Number(minutes) > 59) return undefined;
  if (seconds !== undefined && Number(seconds) > 59) return undefined;

  return Number(hours) * 60 + Number(minutes);
}

export function computeStayDates(event: EventSchedule): StayDates {
  const startDay = toEpochDay(event.startDate);
  const endDay = toEpochDay(event.endDate);

  // An event that ends before it starts is corrupted catalogue data, and the only safe answer
  // is to say so. Clamping it produces a perfectly plausible stay - and the next layer would
  // book transport for a date the event had already finished on.
  if (endDay < startDay) {
    throw new RangeError(
      `An event cannot end before it starts: ${event.startDate} to ${event.endDate}`,
    );
  }

  const opening = localMinutes(event.startsAt);
  const closing = localMinutes(event.endsAt);

  // An opening before noon is not worth chasing on the day; an unknown opening is treated the
  // same way, because arriving a day early costs a night and arriving late costs the trip.
  const arrivesEarly = opening === undefined || opening < NOON_MINUTES;
  const checkInDay = arrivesEarly ? startDay - 1 : startDay;

  // The catalogue never says when an event closes, so the cautious branch is the normal one.
  const staysOver = closing === undefined || closing > EVENING_MINUTES;
  const checkOutDay = staysOver ? endDay + 1 : endDay;

  const nights = checkOutDay - checkInDay;
  const checkIn = toIsoDate(checkInDay);
  const checkOut = toIsoDate(checkOutDay);

  return {
    checkIn,
    checkOut,
    outboundDate: checkIn,
    returnDate: checkOut,
    nights,
    needsHotel: nights > 0,
    openingTimeKnown: opening !== undefined,
    closingTimeKnown: closing !== undefined,
  };
}
