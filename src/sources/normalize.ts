/**
 * Where third-party JSON stops and domain types begin.
 *
 * Everything above this file works with `CatalogueEvent`, `Leg`, `HotelOffer` and nothing else.
 * Everything below it is `unknown` until a schema has looked at it. That boundary is why a
 * change in a Tutu payload breaks one module rather than fifty.
 *
 * Three source behaviours are handled here and nowhere else:
 *   - Tutu answers with a JSON string inside a text block and declares no `outputSchema`;
 *   - `search_multitransport` fails softly per mode, and an empty array is not proof that a
 *     mode does not exist;
 *   - a field a source did not return stays `undefined` all the way to the screen.
 *
 * Reference in `specs/03-istochniki.md`.
 */
import { z } from 'zod';
import type {
  CatalogueEvent,
  CityDirectory,
  EventFormat,
  HotelOffer,
  HotelSearch,
  Leg,
  ModeFailure,
  TransportMode,
  TransportSearch,
} from '../composer/types.ts';

/**
 * A failure with the source that caused it attached, so a screen can say which one fell over
 * instead of showing a stack trace.
 *
 * Written without parameter properties: the toolchain runs TypeScript through Node's native
 * type stripping, which only erases syntax and cannot generate assignments.
 */
export class SourceError extends Error {
  readonly source: string;
  readonly detail: unknown;

  constructor(source: string, message: string, detail?: unknown) {
    super(`${source}: ${message}`);
    this.name = 'SourceError';
    this.source = source;
    this.detail = detail;
  }
}

const TEXT_CONTENT = z.object({ type: z.literal('text').optional(), text: z.string() });

const MCP_RESULT = z.object({
  result: z
    .object({
      content: z.array(TEXT_CONTENT).optional(),
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
    })
    .optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});

/**
 * Opens the envelope both MCP servers answer with.
 *
 * The payload arrives as a JSON string inside a text block. A tool-level failure comes back as
 * `isError: true` with the message in that same text block, which means a successful HTTP
 * response can still be an error, and reading it as data is how a validation message ends up
 * rendered as a trip.
 */
export function unwrapToolResult(source: string, body: unknown): unknown {
  const parsed = MCP_RESULT.safeParse(body);
  if (!parsed.success) {
    throw new SourceError(source, 'answered with something that is not an MCP result', body);
  }
  if (parsed.data.error !== undefined) {
    throw new SourceError(source, parsed.data.error.message, parsed.data.error);
  }

  const result = parsed.data.result;
  if (result === undefined) {
    throw new SourceError(source, 'answered without a result', body);
  }

  const text = result.content?.[0]?.text;
  if (result.isError === true) {
    throw new SourceError(source, text ?? 'reported an error without saying what it was', body);
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (text === undefined) {
    throw new SourceError(source, 'answered with an empty result', body);
  }

  try {
    return JSON.parse(text);
  } catch {
    // Not every text block is JSON. An instruction tool answers with prose, and so does a
    // server that decided to explain itself instead of failing.
    return text;
  }
}

function parseWith<T>(source: string, schema: z.ZodType<T>, payload: unknown, what: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new SourceError(source, `returned ${what} in a shape nobody expected`, parsed.error.issues);
  }
  return parsed.data;
}

const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullish();

const EVENT = z.object({
  id: z.number(),
  title: z.string(),
  url: nullable(z.string()),
  start_date: z.string(),
  end_date: z.string(),
  starts_at: nullable(z.string()),
  ends_at: nullable(z.string()),
  city: nullable(z.string()),
  city_slug: nullable(z.string()),
  venue: nullable(z.string()),
  format: z.string(),
  is_free: nullable(z.boolean()),
  price: nullable(z.string()),
  topics: z.array(z.string()).default([]),
});

const EVENTS = z.object({ items: z.array(EVENT), count: z.number().optional() });

const FORMATS: Readonly<Record<string, EventFormat>> = {
  offline: 'offline',
  online: 'online',
  hybrid: 'hybrid',
};

/** Absent, `null` and empty string are all "the source did not tell us". */
function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

export function normalizeEvents(payload: unknown): readonly CatalogueEvent[] {
  const { items } = parseWith('confcal', EVENTS, payload, 'an event list');

  return items.map((event) => {
    const format = FORMATS[event.format];
    if (format === undefined) {
      // Rounding an unknown format down to "offline" would build a trip to a webinar.
      throw new SourceError('confcal', `used an event format nobody has mapped: "${event.format}"`);
    }

    return {
      id: event.id,
      title: event.title,
      startDate: event.start_date,
      endDate: event.end_date,
      format,
      topics: event.topics,
      ...(text(event.url) === undefined ? {} : { url: text(event.url) as string }),
      ...(text(event.starts_at) === undefined ? {} : { startsAt: text(event.starts_at) as string }),
      ...(text(event.ends_at) === undefined ? {} : { endsAt: text(event.ends_at) as string }),
      ...(text(event.city) === undefined ? {} : { city: text(event.city) as string }),
      ...(text(event.city_slug) === undefined ? {} : { citySlug: text(event.city_slug) as string }),
      ...(text(event.venue) === undefined ? {} : { venue: text(event.venue) as string }),
      ...(event.is_free === null || event.is_free === undefined ? {} : { isFree: event.is_free }),
      ...(text(event.price) === undefined ? {} : { price: text(event.price) as string }),
    };
  });
}

const CITIES = z.object({
  total: z.number(),
  online_count: z.number().optional(),
  items: z.array(z.object({ slug: z.string(), title: z.string(), events_count: z.number() })),
});

export function normalizeCityDirectory(payload: unknown): CityDirectory {
  const directory = parseWith('confcal', CITIES, payload, 'a city directory');

  return {
    citiesTotal: directory.total,
    onlineEvents: directory.online_count ?? 0,
    cities: directory.items.map((city) => ({
      slug: city.slug,
      title: city.title,
      upcomingEvents: city.events_count,
    })),
  };
}

const MONEY = z.object({ amount: z.number(), currency: z.string() });

const VARIANT = z.object({
  offer_id: z.string(),
  transport: z.string(),
  price: MONEY,
  duration_min: z.number(),
  departure_at: z.string(),
  arrival_at: z.string(),
  carriers: z.array(z.string()).default([]),
  search_results_url: nullable(z.string()),
  checkout_ref: nullable(z.record(z.string(), z.unknown())),
  legs: z
    .array(
      z.object({
        from: nullable(z.string()),
        to: nullable(z.string()),
        segments: z
          .array(z.object({ voyage_no: nullable(z.string()) }))
          .optional(),
      }),
    )
    .optional(),
});

const MODE_SUMMARY = z.object({ count: z.number().optional() });

const MULTITRANSPORT = z.object({
  variants: z.array(VARIANT).default([]),
  meta: z
    .object({
      from: z.object({ name: z.string().optional() }).optional(),
      to: z.object({ name: z.string().optional() }).optional(),
      modes_requested: z.array(z.string()).optional(),
      modes_summary: z.record(z.string(), MODE_SUMMARY).optional(),
      unavailable: z
        .array(z.object({ mode: z.string(), reason: z.string(), detail: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

const MODES: Readonly<Record<string, TransportMode>> = {
  avia: 'avia',
  railway: 'railway',
  rail: 'railway',
  bus: 'bus',
  etrain: 'etrain',
};

export function normalizeTransport(payload: unknown): TransportSearch {
  const search = parseWith('tutu', MULTITRANSPORT, payload, 'a transport search');
  const meta = search.meta;

  const legs: Leg[] = search.variants.flatMap((variant) => {
    const mode = MODES[variant.transport];
    // A mode nobody mapped is dropped rather than guessed at; the summary still counts it.
    if (mode === undefined) return [];

    const firstLeg = variant.legs?.[0];
    const voyageNo = text(firstLeg?.segments?.[0]?.voyage_no);

    return [
      {
        offerId: variant.offer_id,
        mode,
        price: variant.price,
        durationMin: variant.duration_min,
        departureAt: variant.departure_at,
        arrivalAt: variant.arrival_at,
        carriers: variant.carriers,
        ...(voyageNo === undefined ? {} : { voyageNo }),
        ...(text(firstLeg?.from) === undefined ? {} : { from: text(firstLeg?.from) as string }),
        ...(text(firstLeg?.to) === undefined ? {} : { to: text(firstLeg?.to) as string }),
        ...(text(variant.search_results_url) === undefined
          ? {}
          : { searchResultsUrl: text(variant.search_results_url) as string }),
        ...(variant.checkout_ref === null || variant.checkout_ref === undefined
          ? {}
          : { checkoutRef: variant.checkout_ref }),
      },
    ];
  });

  const known = (values: readonly string[] | undefined): TransportMode[] =>
    (values ?? []).flatMap((value) => (MODES[value] === undefined ? [] : [MODES[value]]));

  const unavailable: ModeFailure[] = (meta?.unavailable ?? []).flatMap((failure) => {
    const mode = MODES[failure.mode];
    if (mode === undefined) return [];
    return [{ mode, reason: failure.reason, ...(failure.detail === undefined ? {} : { detail: failure.detail })}];
  });

  // "This mode has offers" comes from the summary, not from the page. A mode can be alive and
  // still contribute nothing to the merged page we were handed.
  const withOffers = known(
    Object.entries(meta?.modes_summary ?? {})
      .filter(([, summary]) => (summary.count ?? 0) > 0)
      .map(([mode]) => mode),
  );

  return {
    legs,
    modesRequested: known(meta?.modes_requested),
    modesWithOffers: withOffers,
    modesUnavailable: unavailable,
    ...(text(meta?.from?.name) === undefined ? {} : { resolvedFrom: text(meta?.from?.name) as string }),
    ...(text(meta?.to?.name) === undefined ? {} : { resolvedTo: text(meta?.to?.name) as string }),
  };
}

const HOTEL = z.object({
  hotel_id: z.string(),
  name: z.string(),
  stars: nullable(z.number()),
  rating: nullable(z.number()),
  review_count: nullable(z.number()),
  address: nullable(z.string()),
  alias: nullable(z.string()),
  location: nullable(z.object({ lat: nullable(z.number()), lng: nullable(z.number()) })),
  photos: nullable(z.array(z.string())),
  checkout_ref: nullable(z.record(z.string(), z.unknown())),
  best_offer: z.object({ price: MONEY, price_basis: z.string().optional() }),
});

const HOTELS = z.object({
  hotels: z.array(HOTEL).default([]),
  meta: z
    .object({
      search_id: nullable(z.string()),
      total_returned: z.number().optional(),
      has_more: z.boolean().optional(),
      resolved_geo: z
        .object({ name: z.string().optional(), geo_type: z.string().optional() })
        .optional(),
      also_geo: z.array(z.object({ name: z.string().optional() })).optional(),
    })
    .optional(),
});

export function normalizeHotels(payload: unknown): HotelSearch {
  const search = parseWith('tutu', HOTELS, payload, 'a hotel listing');
  const meta = search.meta;

  const hotels: HotelOffer[] = search.hotels.map((hotel) => {
    const { lat, lng } = hotel.location ?? {};
    const location =
      lat === null || lat === undefined || lng === null || lng === undefined
        ? undefined
        : { lat, lng };

    if (hotel.best_offer.price_basis !== undefined && hotel.best_offer.price_basis !== 'stay_total') {
      // Every hotel price Tutu returns is a whole-stay total. If that ever changes, the sum
      // must break loudly rather than quietly become a per-night figure multiplied by nothing.
      throw new SourceError(
        'tutu',
        `priced a hotel on an unexpected basis: "${hotel.best_offer.price_basis}"`,
      );
    }

    return {
      id: hotel.hotel_id,
      name: hotel.name,
      price: hotel.best_offer.price,
      ...(hotel.stars === null || hotel.stars === undefined ? {} : { stars: hotel.stars }),
      ...(hotel.rating === null || hotel.rating === undefined ? {} : { rating: hotel.rating }),
      ...(hotel.review_count === null || hotel.review_count === undefined
        ? {}
        : { reviewCount: hotel.review_count }),
      ...(text(hotel.address) === undefined ? {} : { address: text(hotel.address) as string }),
      ...(text(hotel.alias) === undefined ? {} : { alias: text(hotel.alias) as string }),
      ...(location === undefined ? {} : { location }),
      ...(text(hotel.photos?.[0]) === undefined ? {} : { photo: text(hotel.photos?.[0]) as string }),
      ...(hotel.checkout_ref === null || hotel.checkout_ref === undefined
        ? {}
        : { checkoutRef: hotel.checkout_ref }),
    };
  });

  return {
    hotels,
    alsoNamed: (meta?.also_geo ?? []).flatMap((geo) => (geo.name === undefined ? [] : [geo.name])),
    totalReturned: meta?.total_returned ?? hotels.length,
    hasMore: meta?.has_more ?? false,
    ...(text(meta?.resolved_geo?.name) === undefined
      ? {}
      : { resolvedGeoName: text(meta?.resolved_geo?.name) as string }),
    ...(meta?.resolved_geo?.geo_type === undefined
      ? {}
      : { resolvedGeoType: meta.resolved_geo.geo_type }),
    ...(text(meta?.search_id) === undefined ? {} : { searchId: text(meta?.search_id) as string }),
  };
}

const CHECKOUT = z.object({
  kind: nullable(z.string()),
  checkout_url: nullable(z.string()),
  fallback_url: nullable(z.string()),
  search_results_url: nullable(z.string()),
});

export type CheckoutAnswer = {
  readonly kind?: string;
  readonly url?: string;
  readonly fallbackUrl?: string;
};

export function normalizeCheckout(payload: unknown): CheckoutAnswer {
  const answer = parseWith('tutu', CHECKOUT, payload, 'a checkout link');
  const fallback = text(answer.fallback_url) ?? text(answer.search_results_url);

  return {
    ...(text(answer.kind) === undefined ? {} : { kind: text(answer.kind) as string }),
    ...(text(answer.checkout_url) === undefined ? {} : { url: text(answer.checkout_url) as string }),
    ...(fallback === undefined ? {} : { fallbackUrl: fallback }),
  };
}
