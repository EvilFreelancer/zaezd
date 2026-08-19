/**
 * From the domain result to what an agent reads, and no further.
 *
 * Two audiences, one source. `shapeTrip` writes the flat snake_case structure the model parses;
 * `textFor` writes the paragraph a host without a widget prints instead of the screen. Neither
 * computes anything: every number here was decided by the deterministic core, and this file only
 * chooses words and formats.
 */
import type { Leg, TripRequest } from '../composer/types.ts';
import type { RankedHotel } from '../composer/hotels.ts';
import type { TripResult } from '../composer/build-trip.ts';
import { toList, toNumber, toText } from '../sources/arguments.ts';
import {
  coverageSentence,
  plural,
  sourceNoteText,
  EMPTY_REASONS,
  MODE_NAMES,
  NOTE_TEXTS,
  RULE_NAMES,
} from '../web/client/copy.ts';

export function requestFrom(args: Readonly<Record<string, unknown>>): TripRequest {
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

export function detailsOf(trip: TripResult): Record<string, unknown> {
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

export function shapeTrip(trip: TripResult, tripId: string, webUrl?: string): Record<string, unknown> {
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
export function pickPackage(
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

export const PART_NAMES: Readonly<Record<string, string>> = {
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
export function textFor(shaped: Record<string, unknown>): string {
  const event = shaped['event'] as
    | { title?: string; city?: string; starts_at?: string; venue?: string; venue_precision?: string }
    | undefined;
  const packages = shaped['packages'] as readonly ShapedPackage[];
  const coverage = String(shaped['coverage']);

  if (event === undefined) {
    const why = shaped['empty_reason'];
    const reason = typeof why === 'string' ? (EMPTY_REASONS[why] ?? why) : 'Поездка не собрана.';
    return [reason, coverage].join('\n');
  }

  const stay = shaped['stay'] as { check_in: string; check_out: string; nights: number } | undefined;
  const lines: string[] = [`${event.title}, ${event.city ?? 'город не указан'}`];

  // The catalogue gave no address, and this product does not make one up. An agent that can
  // search the web can, so it is asked to - and asked to say where the address came from.
  if (event.venue_precision !== 'exact') {
    lines.push(
      event.venue === undefined
        ? 'Площадку каталог не назвал: найдите адрес в открытых источниках по названию события.'
        : `Точного адреса каталог не дал, известно только "${event.venue}": найдите адрес в ` +
          'открытых источниках и скажите, что он не из каталога.',
    );
  }

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

