/**
 * What the three tools promise, in one place.
 *
 * The input side is deliberately loose: a list arrives as a list, as JSON or comma-separated,
 * and coercion happens once, in `requestFrom`. The output side is strict and complete, because
 * `structuredContent` is the contract a text host reads instead of the screen, and the gap this
 * closes is precisely the one measured in Tutu MCP.
 */
import { z } from 'zod';

export const FIND_INPUT = {
  topics: z
    .unknown()
    .optional()
    .describe('Обязательно. Темы конференций: массив, JSON-строка или через запятую'),
  origin: z.unknown().optional().describe('Обязательно. Город, откуда едет человек'),
  budget: z.unknown().optional().describe('Бюджет на всю поездку, в рублях'),
  date_from: z.unknown().optional().describe('Не раньше этой даты, YYYY-MM-DD'),
  date_to: z.unknown().optional().describe('Не позже этой даты, YYYY-MM-DD'),
  adults: z.unknown().optional().describe('Сколько взрослых едет, по умолчанию один'),
};

export const MONEY = z.object({ amount: z.number(), currency: z.string() });

export const LEG_OUTPUT = z.object({
  mode: z.string(),
  departure_at: z.string(),
  arrival_at: z.string(),
  price: MONEY,
  duration_min: z.number().optional(),
  /** The flight or train number, so a person can recognise it on the Tutu page. */
  voyage_no: z.string().optional(),
  carriers: z.array(z.string()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const PACKAGE_OUTPUT = z.object({
  variant_id: z.string(),
  rules: z.array(z.string()),
  total: MONEY,
  /** True when a part of the total was itself a lower bound, so the total cannot be exact. */
  is_lower_bound: z.boolean(),
  /** False when a mandatory part is missing; such a figure is not the price of taking part. */
  complete: z.boolean(),
  /** What the total is missing: `outbound`, `back`, `hotel`. Rendered as missing, never guessed. */
  missing: z.array(z.string()),
  /** True when the catalogue wrote the event price as text, so it could not be summed. */
  event_price_excluded: z.boolean(),
  /** The event price exactly as the catalogue wrote it, when it was not a number. */
  event_price_text: z.string().optional(),
  outbound: LEG_OUTPUT,
  back: LEG_OUTPUT,
  hotel: z
    .object({
      name: z.string(),
      price: MONEY,
      /**
       * Always `stay_total`. Spelled out because a comment in a schema is not something a model
       * reads, and multiplying this by the night count is the single most expensive mistake an
       * agent can make with this payload.
       */
      price_basis: z.literal('stay_total'),
      address: z.string().optional(),
      stars: z.number().optional(),
      rating: z.number().optional(),
      /** Straight-line metres to the venue, only when both points are genuinely known. */
      distance_m: z.number().optional(),
    })
    .optional(),
  makes_the_opening: z.boolean().optional(),
  margin_minutes: z.number().optional(),
  working_days_burnt: z.number().optional(),
});

export const FIND_OUTPUT = {
  trip_id: z.string(),
  web_url: z.string().optional(),
  event: z
    .object({
      title: z.string(),
      city: z.string().optional(),
      url: z.string().optional(),
      starts_at: z.string().optional(),
      venue: z.string().optional(),
      venue_precision: z.string(),
    })
    .optional(),
  stay: z.object({ check_in: z.string(), check_out: z.string(), nights: z.number() }).optional(),
  packages: z.array(PACKAGE_OUTPUT),
  coverage: z.string(),
  notes: z.array(z.string()),
  alternatives: z.array(z.object({ title: z.string(), city: z.string().optional(), start_date: z.string() })),
  empty_reason: z.string().optional(),
  computed_at: z.string(),
  mode: z.string(),
};

export const FORECAST_OUTPUT = z.object({
  date: z.string(),
  max_c: z.number(),
  min_c: z.number(),
  rain_chance: z.number().optional(),
});

/** Everything the search returns, plus the two things only an opened trip carries. */
export const DETAILS_OUTPUT = {
  ...FIND_OUTPUT,
  /** Minutes on foot from the chosen hotel to the venue. Absent unless a route was computed. */
  walk_minutes: z.number().optional(),
  forecast: z.array(FORECAST_OUTPUT).optional(),
};

export const DETAILS_INPUT = {
  trip_id: z.string().describe('Идентификатор поездки из find_event_trips'),
  package: z
    .unknown()
    .optional()
    .describe('variant_id или имя правила; без него возвращаются все пакеты поездки'),
};

export const CHECKOUT_INPUT = {
  trip_id: z.string().describe('Идентификатор поездки из find_event_trips'),
  package: z
    .unknown()
    .optional()
    .describe('variant_id или имя правила; без него берётся первый пакет поездки'),
};

export const CHECKOUT_OUTPUT = {
  trip_id: z.string(),
  /** Which package these links belong to; with three cards on screen this is not a detail. */
  variant_id: z.string(),
  rules: z.array(z.string()),
  links: z.array(
    z.object({
      part: z.string(),
      url: z.string(),
      kind: z.string().optional(),
      label: z.string(),
      opens_a_cart: z.boolean(),
      caveat: z.string().optional(),
      recorded: z.boolean().optional(),
    }),
  ),
};

/**
 * Forgiving about shape, strict about substance.
 *
 * A list arrives as a list, as JSON or comma-separated, and a number arrives as a number or as
 * a string; all of that is understood. What cannot be understood is a request with no topic or
 * no origin: guessing one would hand back a plausible trip nobody asked for, which is the exact
 * failure this product exists to avoid. Only the party size has a default worth having.
 */
