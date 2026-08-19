/**
 * The gateway: three verbs instead of sixteen searches.
 *
 * What faces an agent is a product contract - find a trip, open it, hand over the payment
 * checklist - not a re-export of somebody else's search tools. That is also the difference
 * between a manifest of 102 143 characters and one an agent can hold alongside everything else
 * it is doing.
 *
 * All three declare an `outputSchema` and return `structuredContent`, which is precisely the
 * gap measured in Tutu MCP and closing it removes a class of client parse errors outright.
 *
 * Specified in `specs/06-mcp-shlyuz.md`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { App } from '../app.ts';
import { decodeTripId, encodeTripId, TripIdError } from '../composer/trip-id.ts';
import { toList, toNumber, toText } from '../sources/arguments.ts';
import type { Leg, TripRequest } from '../composer/types.ts';
import type { RankedHotel } from '../composer/hotels.ts';
import type { TripResult } from '../composer/build-trip.ts';
import { renderShell } from '../web/render.ts';
import {
  coverageSentence,
  plural,
  sourceNoteText,
  EMPTY_REASONS,
  MODE_NAMES,
  NOTE_TEXTS,
  RULE_NAMES,
} from '../web/client/copy.ts';

export const UI_RESOURCE = 'ui://zaezd/trip-board';

/**
 * Every list argument is accepted in the three shapes agents actually send, so the schema is
 * deliberately loose and the coercion happens once, here, before anything else sees it.
 */
const FIND_INPUT = {
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

const MONEY = z.object({ amount: z.number(), currency: z.string() });

const LEG_OUTPUT = z.object({
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

const PACKAGE_OUTPUT = z.object({
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

const FIND_OUTPUT = {
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

const FORECAST_OUTPUT = z.object({
  date: z.string(),
  max_c: z.number(),
  min_c: z.number(),
  rain_chance: z.number().optional(),
});

/** Everything the search returns, plus the two things only an opened trip carries. */
const DETAILS_OUTPUT = {
  ...FIND_OUTPUT,
  /** Minutes on foot from the chosen hotel to the venue. Absent unless a route was computed. */
  walk_minutes: z.number().optional(),
  forecast: z.array(FORECAST_OUTPUT).optional(),
};

const DETAILS_INPUT = {
  trip_id: z.string().describe('Идентификатор поездки из find_event_trips'),
  package: z
    .unknown()
    .optional()
    .describe('variant_id или имя правила; без него возвращаются все пакеты поездки'),
};

const CHECKOUT_INPUT = {
  trip_id: z.string().describe('Идентификатор поездки из find_event_trips'),
  package: z
    .unknown()
    .optional()
    .describe('variant_id или имя правила; без него берётся первый пакет поездки'),
};

const CHECKOUT_OUTPUT = {
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
function requestFrom(args: Readonly<Record<string, unknown>>): TripRequest {
  const topics = toList(args['topics']);
  const origin = toText(args['origin']);
  if (topics.length === 0) {
    throw new Error('Не указана тема. Например: topics: ["ai"] или topics: "ai, data"');
  }
  if (origin === undefined) {
    throw new Error('Не указан город отправления. Например: origin: "Москва"');
  }

  return {
    topics,
    origin,
    adults: toNumber(args['adults']) ?? 1,
    ...(toNumber(args['budget']) === undefined ? {} : { budget: toNumber(args['budget']) as number }),
    ...(toText(args['date_from']) === undefined ? {} : { dateFrom: toText(args['date_from']) as string }),
    ...(toText(args['date_to']) === undefined ? {} : { dateTo: toText(args['date_to']) as string }),
  };
}

/** A leg as an agent sees it. Absent detail stays absent; nothing here is filled in by guess. */
function shapeLeg(leg: Leg): Record<string, unknown> {
  return {
    mode: leg.mode,
    departure_at: leg.departureAt,
    arrival_at: leg.arrivalAt,
    price: leg.price,
    ...(leg.durationMin === undefined ? {} : { duration_min: leg.durationMin }),
    ...(leg.voyageNo === undefined ? {} : { voyage_no: leg.voyageNo }),
    ...(leg.carriers === undefined || leg.carriers.length === 0
      ? {}
      : { carriers: [...leg.carriers] }),
    ...(leg.from === undefined ? {} : { from: leg.from }),
    ...(leg.to === undefined ? {} : { to: leg.to }),
  };
}

function shapeHotel(ranked: RankedHotel): Record<string, unknown> {
  return {
    name: ranked.hotel.name,
    price: ranked.hotel.price,
    price_basis: 'stay_total',
    ...(ranked.hotel.address === undefined ? {} : { address: ranked.hotel.address }),
    ...(ranked.hotel.stars === undefined ? {} : { stars: ranked.hotel.stars }),
    ...(ranked.hotel.rating === undefined ? {} : { rating: ranked.hotel.rating }),
    ...(ranked.distanceM === undefined ? {} : { distance_m: ranked.distanceM }),
  };
}

function detailsOf(trip: TripResult): Record<string, unknown> {
  return {
    ...(trip.event?.walkingMinutes === undefined ? {} : { walk_minutes: trip.event.walkingMinutes }),
    ...(trip.forecast === undefined
      ? {}
      : {
          forecast: trip.forecast.map((day) => ({
            date: day.date,
            max_c: day.maxC,
            min_c: day.minC,
            ...(day.rainChance === undefined ? {} : { rain_chance: day.rainChance }),
          })),
        }),
  };
}

function shapeTrip(trip: TripResult, tripId: string, webUrl?: string): Record<string, unknown> {
  const notes = [
    ...trip.notes.map((note) => NOTE_TEXTS[note] ?? note),
    ...trip.sourceNotes.map(sourceNoteText),
    ...(trip.mode === 'replay' ? ['Ответ собран из записи, ссылки на оплату могли протухнуть.'] : []),
  ];

  return {
    trip_id: tripId,
    ...(webUrl === undefined ? {} : { web_url: webUrl }),
    ...(trip.event === undefined
      ? {}
      : {
          event: {
            title: trip.event.event.title,
            venue_precision: trip.event.venueLocation.precision,
            ...(trip.event.event.city === undefined ? {} : { city: trip.event.event.city }),
            ...(trip.event.event.url === undefined ? {} : { url: trip.event.event.url }),
            ...(trip.event.event.startsAt === undefined ? {} : { starts_at: trip.event.event.startsAt }),
            ...(trip.event.event.venue === undefined ? {} : { venue: trip.event.event.venue }),
          },
        }),
    ...(trip.stay === undefined
      ? {}
      : { stay: { check_in: trip.stay.checkIn, check_out: trip.stay.checkOut, nights: trip.stay.nights } }),
    packages: trip.packages.map((item) => ({
      variant_id: item.variant.id,
      rules: [...item.rules],
      total: { amount: item.variant.cost.total, currency: item.variant.cost.currency },
      is_lower_bound: item.variant.cost.isLowerBound,
      complete: item.variant.cost.complete,
      missing: [...item.variant.cost.missing],
      event_price_excluded: item.variant.cost.eventPriceExcluded,
      ...(item.variant.cost.eventPriceText === undefined
        ? {}
        : { event_price_text: item.variant.cost.eventPriceText }),
      outbound: shapeLeg(item.variant.outbound),
      back: shapeLeg(item.variant.back),
      ...(item.variant.hotel === undefined
        ? {}
        : { hotel: shapeHotel(item.variant.hotel) }),
      ...(item.variant.feasibility.makesTheOpening === undefined
        ? {}
        : { makes_the_opening: item.variant.feasibility.makesTheOpening }),
      ...(item.variant.feasibility.marginMinutes === undefined
        ? {}
        : { margin_minutes: item.variant.feasibility.marginMinutes }),
      ...(item.variant.workingDaysBurnt === undefined
        ? {}
        : { working_days_burnt: item.variant.workingDaysBurnt }),
    })),
    coverage: coverageSentence(trip.coverage),
    notes,
    alternatives: trip.alternatives.map((event) => ({
      title: event.title,
      start_date: event.startDate,
      ...(event.city === undefined ? {} : { city: event.city }),
    })),
    ...(trip.emptyReason === undefined ? {} : { empty_reason: trip.emptyReason }),
    computed_at: trip.computedAt,
    mode: trip.mode,
  };
}

/**
 * The package the agent asked for, or a refusal.
 *
 * Answering a request for a package this trip never had with the first one it does have hands
 * over prices and links that belong to a different journey. Saying so costs one sentence.
 */
function pickPackage(
  trip: TripResult,
  wanted: string | undefined,
): readonly TripResult['packages'][number][] {
  if (wanted === undefined) return trip.packages;

  const found = trip.packages.filter(
    (item) => item.variant.id === wanted || item.rules.some((rule) => rule === wanted),
  );
  if (found.length > 0) return found;

  const offered = trip.packages.map((item) => item.rules.join('+')).join(', ');
  throw new Error(
    offered === ''
      ? `Пакет "${wanted}" в этой поездке не собран, предлагать нечего`
      : `Пакет "${wanted}" в этой поездке не собран. Есть: ${offered}`,
  );
}

type ShapedMoney = { readonly amount: number; readonly currency: string };
type ShapedLeg = { readonly mode: string; readonly departure_at: string; readonly arrival_at: string; readonly price: ShapedMoney };
type ShapedPackage = {
  readonly rules: readonly string[];
  readonly total: ShapedMoney;
  readonly is_lower_bound: boolean;
  readonly complete: boolean;
  readonly missing: readonly string[];
  readonly event_price_excluded: boolean;
  readonly event_price_text?: string;
  readonly outbound: ShapedLeg;
  readonly back: ShapedLeg;
  readonly hotel?: { readonly name: string; readonly price: ShapedMoney };
  readonly makes_the_opening?: boolean;
};

const PART_NAMES: Readonly<Record<string, string>> = {
  outbound: 'Туда',
  back: 'Обратно',
  hotel: 'Отель',
};

const MISSING_PARTS: Readonly<Record<string, string>> = {
  outbound: 'дороги туда',
  back: 'дороги обратно',
  hotel: 'отеля',
};

/** `2026-08-20T09:15:00+03:00` as `20.08 09:15`, in the offset the payload was written in. */
function clock(at: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  return parts === null ? at : `${parts[3]}.${parts[2]} ${parts[4]}:${parts[5]}`;
}

function money(amount: ShapedMoney): string {
  return `${amount.amount} ${amount.currency}`;
}

function legLine(what: string, leg: ShapedLeg): string {
  const mode = MODE_NAMES[leg.mode] ?? leg.mode;
  return `  ${what}: ${mode}, ${clock(leg.departure_at)} - ${clock(leg.arrival_at)}, ${money(leg.price)}`;
}

/**
 * The channel with no widget.
 *
 * Codex and any other text host read this and nothing else, so it carries what a person needs
 * to decide - dates, both legs, the hotel, the total and the link - rather than a headline over
 * a JSON blob. Every number here was computed upstream; this function only formats.
 */
function textFor(shaped: Record<string, unknown>): string {
  const event = shaped['event'] as { title?: string; city?: string; starts_at?: string } | undefined;
  const packages = shaped['packages'] as readonly ShapedPackage[];
  const coverage = String(shaped['coverage']);

  if (event === undefined) {
    const why = shaped['empty_reason'];
    const reason = typeof why === 'string' ? (EMPTY_REASONS[why] ?? why) : 'Поездка не собрана.';
    return [reason, coverage].join('\n');
  }

  const stay = shaped['stay'] as { check_in: string; check_out: string; nights: number } | undefined;
  const lines: string[] = [`${event.title}, ${event.city ?? 'город не указан'}`];
  if (stay !== undefined) {
    lines.push(
      `Заезд ${stay.check_in}, выезд ${stay.check_out}, ` +
        `${stay.nights} ${plural(stay.nights, 'ночь', 'ночи', 'ночей')}`,
    );
  }

  for (const item of packages) {
    const rules = item.rules.map((rule) => RULE_NAMES[rule] ?? rule).join(' + ');
    const total = item.is_lower_bound ? `от ${money(item.total)}` : money(item.total);
    lines.push('', `${rules}: ${total}`);
    lines.push(legLine('туда', item.outbound));
    if (item.hotel !== undefined) {
      lines.push(`  отель: ${item.hotel.name}, ${money(item.hotel.price)} за всё проживание`);
    }
    lines.push(legLine('обратно', item.back));
    if (item.makes_the_opening === false) {
      lines.push('  к открытию этот вариант не успевает');
    }
    if (!item.complete) {
      const parts = item.missing.map((part) => MISSING_PARTS[part] ?? part).join(', ');
      lines.push(`  это не полная цена участия: нет ${parts}`);
    }
    if (item.event_price_excluded) {
      lines.push(
        item.event_price_text === undefined
          ? '  цена участия в событии в сумму не входит'
          : `  цена участия в сумму не входит, каталог написал: ${item.event_price_text}`,
      );
    }
  }

  const walk = shaped['walk_minutes'];
  if (typeof walk === 'number') {
    lines.push('', `От отеля до площадки ${walk} ${plural(walk, 'минута', 'минуты', 'минут')} пешком`);
  }

  const forecast = shaped['forecast'] as
    | readonly { date: string; max_c: number; min_c: number; rain_chance?: number }[]
    | undefined;
  if (forecast !== undefined && forecast.length > 0) {
    lines.push(
      '',
      'Погода: ' +
        forecast
          .map(
            (day) =>
              `${day.date} от ${day.min_c} до ${day.max_c} °C` +
              (day.rain_chance === undefined ? '' : `, осадки ${day.rain_chance}%`),
          )
          .join('; '),
    );
  }

  const notes = shaped['notes'] as readonly string[];
  const webUrl = shaped['web_url'];
  return [
    ...lines,
    '',
    coverage,
    ...notes,
    ...(typeof webUrl === 'string' ? [`Открыть на экране: ${webUrl}`] : []),
  ].join('\n');
}

export function createMcpServer(app: App, publicUrl: string): McpServer {
  const server = new McpServer(
    { name: 'zaezd', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  const linkFor = (request: TripRequest): { id: string; url: string } => {
    const id = encodeTripId({ request });
    return { id, url: `${publicUrl.replace(/\/$/, '')}/t/${id}` };
  };

  server.registerTool(
    'find_event_trips',
    {
      title: 'Найти поездку на конференцию',
      description:
        'Собирает поездку от повода: находит ближайшее офлайн-событие по теме, считает дорогу ' +
        'туда и обратно, отель и полную цену участия, и возвращает до трёх объяснимых пакетов.',
      inputSchema: FIND_INPUT,
      outputSchema: FIND_OUTPUT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE, visibility: ['model', 'app'] } },
    },
    async (args) => {
      const request = requestFrom(args as Record<string, unknown>);
      const trip = await app.assemble(request);
      const link = linkFor(request);
      const shaped = shapeTrip(trip, link.id, link.url);

      return { content: [{ type: 'text', text: textFor(shaped) }], structuredContent: shaped };
    },
  );

  server.registerTool(
    'get_trip_details',
    {
      title: 'Раскрыть пакет поездки',
      description: 'Подробности одного пакета: дороги, отель, запас до начала и погода, если она есть.',
      inputSchema: DETAILS_INPUT,
      outputSchema: DETAILS_OUTPUT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE, visibility: ['model', 'app'] } },
    },
    async (args) => {
      const { request } = decodeTripId(String((args as Record<string, unknown>)['trip_id']));
      const trip = await app.assemble(request);
      const only = pickPackage(trip, toText((args as Record<string, unknown>)['package']));

      const link = linkFor(request);
      const shaped = {
        ...shapeTrip({ ...trip, packages: only }, link.id, link.url),
        ...detailsOf(trip),
      };
      return { content: [{ type: 'text', text: textFor(shaped) }], structuredContent: shaped };
    },
  );

  server.registerTool(
    'create_trip_checkout',
    {
      title: 'Собрать ссылки на оплату',
      description:
        'Чек-лист из двух-трёх ссылок Туту. Подпись каждой берётся из фактического kind, ' +
        'который вернул Туту, а корзину заводит сам человек в своей сессии.',
      inputSchema: CHECKOUT_INPUT,
      outputSchema: CHECKOUT_OUTPUT,
      // Honest: it changes nothing on our side, and the links it returns expire.
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const tripId = String((args as Record<string, unknown>)['trip_id']);
      const { request } = decodeTripId(tripId);
      const trip = await app.assemble(request);

      const chosen = pickPackage(trip, toText((args as Record<string, unknown>)['package']))[0];
      if (chosen === undefined) {
        throw new Error('Для этой поездки не собран ни один пакет, оплачивать нечего');
      }

      const links = await app.checkout(trip, chosen.variant);
      const shaped = {
        trip_id: tripId,
        variant_id: chosen.variant.id,
        rules: [...chosen.rules],
        links: links.map((link) => ({
          part: link.part,
          url: link.url,
          label: link.label,
          opens_a_cart: link.opensACart,
          ...(link.kind === undefined ? {} : { kind: link.kind }),
          ...(link.caveat === undefined ? {} : { caveat: link.caveat }),
          ...(link.recorded === undefined ? {} : { recorded: link.recorded }),
        })),
      };

      // A checklist read out loud must carry its warnings, or the caveat lives only in a field
      // a text host never prints and the traveller opens a search expecting a cart.
      const written = [
        `Пакет: ${chosen.rules.map((rule) => RULE_NAMES[rule] ?? rule).join(' + ')}`,
        ...links.flatMap((link) => [
        `${PART_NAMES[link.part] ?? link.part}: ${link.label}`,
        `  ${link.url}`,
        ...(link.caveat === undefined ? [] : [`  ${link.caveat}`]),
        ...(link.recorded === true ? ['  ссылка из записи, скорее всего уже протухла'] : []),
        ]),
      ];

      return {
        content: [{ type: 'text', text: written.join('\n') }],
        structuredContent: shaped,
      };
    },
  );

  /**
   * One resource, not three. The App loads it independently of the tool call and receives the
   * result afterwards, so the shell ships without data and the renderer fills it in.
   */
  server.registerResource(
    'trip-board',
    UI_RESOURCE,
    {
      title: 'Экран поездки',
      description: 'Тот же экран, что и на публичной ссылке.',
      mimeType: 'text/html;profile=mcp-app',
      _meta: {
        ui: {
          csp: {
            connectDomains: [publicUrl],
            resourceDomains: [publicUrl, 'https://tile.openstreetmap.de', 'https://cdn1.tu-tu.ru', 'https://cdn2.tu-tu.ru'],
          },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: UI_RESOURCE,
          mimeType: 'text/html;profile=mcp-app',
          text: renderShell({
            channel: 'app',
            title: 'Заезд',
            assets: {
              styles: `${publicUrl}/styles.css`,
              script: `${publicUrl}/boot.js`,
              leaflet: `${publicUrl}/vendor/leaflet/leaflet.css`,
            },
          }),
        },
      ],
    }),
  );

  return server;
}

export { TripIdError };
