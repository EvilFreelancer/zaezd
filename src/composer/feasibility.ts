/**
 * Whether the traveller actually makes it.
 *
 * A variant that arrives after the doors open is not a cheaper trip, it is a wasted one, so
 * every combination is checked before it is offered and the answer is a number rather than a
 * reassuring adjective. Pure and clock-free, like the rest of the core.
 *
 * Specified in `specs/04-kompozitor.md`, step 4.
 */
import type { IsoDate, IsoDateTime } from './types.ts';

/** How early the traveller has to be in the room, in minutes before the event opens. */
const DEFAULT_MARGIN_MINUTES = 60;

const MS_PER_MINUTE = 60_000;

export type FeasibilityNote =
  | 'opening-time-unknown'
  | 'closing-time-unknown'
  | 'arrival-time-unreadable'
  | 'return-time-unreadable'
  | 'arrival-time-missing'
  | 'return-time-missing';

export type EventTiming = {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly startsAt?: IsoDateTime;
  readonly endsAt?: IsoDateTime;
};

export type FeasibilityInput = {
  readonly event: EventTiming;
  readonly arrivalAt?: IsoDateTime;
  readonly returnDepartureAt?: IsoDateTime;
  readonly requiredMarginMinutes?: number;
};

export type Feasibility = {
  /** `undefined` means the sources did not give enough to judge, which is not the same as false. */
  readonly makesTheOpening?: boolean;
  /** Minutes between arrival and the opening. Negative when the traveller is already late. */
  readonly marginMinutes?: number;
  readonly leavesAfterTheEnd?: boolean;
  readonly canBePrimary: boolean;
  readonly notes: readonly FeasibilityNote[];
};

/**
 * An instant, or `undefined` when the string is not one.
 *
 * The offset is required, and that is the whole point of this function. `Date.parse` reads a
 * timestamp without one in the machine's own time zone, so the same trip would be feasible on
 * a server in Moscow and infeasible on a server in Tokyo. This layer answers the same way
 * everywhere or it answers nothing.
 */
function toInstant(value: IsoDateTime | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** The calendar day a moment falls on, in the offset it was written with. */
function localDay(value: IsoDateTime): IsoDate {
  return value.slice(0, 10);
}

export function checkFeasibility(input: FeasibilityInput): Feasibility {
  const notes: FeasibilityNote[] = [];
  const margin = input.requiredMarginMinutes ?? DEFAULT_MARGIN_MINUTES;

  let makesTheOpening: boolean | undefined;
  let marginMinutes: number | undefined;

  const opening = toInstant(input.event.startsAt);
  if (opening === undefined) {
    // Absent and unreadable are the same thing to a traveller: nobody knows when it opens.
    notes.push('opening-time-unknown');
  }

  if (input.arrivalAt === undefined) {
    // Not knowing when the traveller lands is not the same as landing in time.
    notes.push('arrival-time-missing');
  } else {
    const arrival = toInstant(input.arrivalAt);
    if (arrival === undefined) {
      // A time nobody can read is not a time that works out. Say so instead of assuming.
      notes.push('arrival-time-unreadable');
    } else if (opening !== undefined) {
      // Compared as instants, not as rounded minutes: 59 minutes and 30 seconds rounds to 60
      // and would wave through a traveller who does not have the hour this check guarantees.
      makesTheOpening = opening - arrival >= margin * MS_PER_MINUTE;
      // Floored, so the margin shown is never longer than the margin the traveller has.
      marginMinutes = Math.floor((opening - arrival) / MS_PER_MINUTE);
    }
  }

  let leavesAfterTheEnd: boolean | undefined;

  if (input.returnDepartureAt === undefined) {
    notes.push('return-time-missing');
  } else {
    const departure = toInstant(input.returnDepartureAt);
    const closing = toInstant(input.event.endsAt);

    if (departure === undefined) {
      notes.push('return-time-unreadable');
    } else if (closing !== undefined) {
      leavesAfterTheEnd = departure >= closing;
    } else {
      // No closing time, so only the calendar can be trusted. Leaving before the last day is
      // certainly too early; leaving on the last day cannot be judged and is not pretended to be.
      notes.push('closing-time-unknown');
      const day = localDay(input.returnDepartureAt);
      if (day < input.event.endDate) leavesAfterTheEnd = false;
      else if (day > input.event.endDate) leavesAfterTheEnd = true;
    }
  }

  // A time that is missing and a time that cannot be read block the headline card equally: in
  // both cases the product does not know whether the traveller makes it.
  const unknownTiming = (
    ['arrival-time-unreadable', 'return-time-unreadable', 'arrival-time-missing', 'return-time-missing'] as const
  ).some((note) => notes.includes(note));

  return {
    ...(makesTheOpening === undefined ? {} : { makesTheOpening }),
    ...(marginMinutes === undefined ? {} : { marginMinutes }),
    ...(leavesAfterTheEnd === undefined ? {} : { leavesAfterTheEnd }),
    canBePrimary: makesTheOpening !== false && leavesAfterTheEnd !== false && !unknownTiming,
    notes,
  };
}
