/**
 * The public link, and what it is honest about.
 *
 * `trip_id` encodes the request, not the answer. There is no trip state on the server, so
 * `/t/:id` is reproducible from the identifier alone - and it recomputes rather than unfreezes,
 * which the screen says out loud with the time the answer was computed. Pretending a recomputed
 * trip is the same trip a link was shared for would be the quiet kind of lying this product is
 * built against.
 *
 * Reference in `specs/02-arhitektura.md` and `specs/07-nadezhnost.md`.
 */
import type { TripRequest } from './types.ts';

const VERSION = 'v1';

/**
 * A ceiling on the identifier, because it arrives in a URL from strangers.
 *
 * Cyrillic costs roughly six characters per letter once percent-encoded, so this is generous
 * for a real request and still small enough that nobody can make the server parse a megabyte.
 */
const MAX_LENGTH = 512;

export class TripIdError extends Error {
  readonly reason: 'malformed' | 'unknown-version' | 'too-long';

  constructor(reason: TripIdError['reason'], message: string) {
    super(message);
    this.name = 'TripIdError';
    this.reason = reason;
  }
}

export type EncodedTrip = {
  readonly request: TripRequest;
  /** The catalogue event the link was made for, so the same trip is reopened, not a newer one. */
  readonly eventId?: number;
};

type Wire = {
  readonly t: readonly string[];
  readonly o: string;
  readonly a: number;
  readonly b?: number;
  readonly f?: string;
  readonly u?: string;
  readonly e?: number;
};

/** Sorted keys and sorted topics, so the same request always produces the same link. */
function toWire(trip: EncodedTrip): Wire {
  const { request } = trip;
  return {
    t: [...request.topics].map((topic) => topic.trim().toLowerCase()).sort(),
    o: request.origin.trim(),
    a: request.adults,
    ...(request.budget === undefined ? {} : { b: request.budget }),
    ...(request.dateFrom === undefined ? {} : { f: request.dateFrom }),
    ...(request.dateTo === undefined ? {} : { u: request.dateTo }),
    ...(trip.eventId === undefined ? {} : { e: trip.eventId }),
  };
}

function canonical(wire: Wire): string {
  const entries = Object.entries(wire).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

export function encodeTripId(trip: EncodedTrip): string {
  const encoded = Buffer.from(canonical(toWire(trip)), 'utf8').toString('base64url');
  return `${VERSION}.${encoded}`;
}

export function decodeTripId(id: string): EncodedTrip {
  if (id.length > MAX_LENGTH) {
    throw new TripIdError('too-long', `Ссылка на поездку длиннее ${MAX_LENGTH} символов, столько мы не читаем`);
  }

  const dot = id.indexOf('.');
  const version = dot === -1 ? '' : id.slice(0, dot);
  if (version !== VERSION) {
    throw new TripIdError(
      'unknown-version',
      `Эту ссылку сделала другая версия Заезда ("${version}"), соберите поездку заново`,
    );
  }

  let wire: unknown;
  try {
    wire = JSON.parse(Buffer.from(id.slice(dot + 1), 'base64url').toString('utf8'));
  } catch {
    throw new TripIdError('malformed', 'Ссылка повреждена, прочитать её не получилось');
  }

  const shaped = wire as Partial<Wire>;
  if (
    !Array.isArray(shaped.t) ||
    typeof shaped.o !== 'string' ||
    shaped.o === '' ||
    typeof shaped.a !== 'number'
  ) {
    throw new TripIdError('malformed', 'Эта ссылка не описывает поездку');
  }

  return {
    request: {
      topics: shaped.t.filter((topic): topic is string => typeof topic === 'string'),
      origin: shaped.o,
      adults: shaped.a,
      ...(typeof shaped.b === 'number' ? { budget: shaped.b } : {}),
      ...(typeof shaped.f === 'string' ? { dateFrom: shaped.f } : {}),
      ...(typeof shaped.u === 'string' ? { dateTo: shaped.u } : {}),
    },
    ...(typeof shaped.e === 'number' ? { eventId: shaped.e } : {}),
  };
}
