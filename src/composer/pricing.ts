/**
 * What the trip costs, how many working days it burns, and what the product refuses to guess.
 *
 * The headline figure is the price of taking part, not the price of a ticket: getting there,
 * sleeping somewhere, getting back, and the event. Every part comes from its own source and
 * keeps its own name, and a part nobody could read stays out of the sum instead of being
 * rounded into it.
 *
 * Specified in `specs/04-kompozitor.md`, steps 6 and 7.
 */
import type { IsoDate, IsoDateTime, Money } from './types.ts';

/** Money is added in whole kopecks. 2090.93 + 2090.93 in floats is not 4181.86. */
const MINOR_UNITS = 100;

const RUB = 'RUB';

const AMOUNT = String.raw`\d[\d\s  ]*(?:[.,]\d+)?`;
const CURRENCY = String.raw`(?:₽|руб\.?|рублей|рубля|р\.)`;

const PRICE_ANYWHERE = new RegExp(`(${AMOUNT})\\s*${CURRENCY}`, 'giu');
const PRICE_FROM = new RegExp(`^\\s*от\\s+(${AMOUNT})\\s*${CURRENCY}`, 'iu');
const FREE_WORD = /бесплатн\w*/giu;
/**
 * The boundaries are spelled out because JavaScript's `\b` is ASCII-only and never fires next
 * to a Cyrillic letter, which let "Для представителей ОПК" through as a price.
 */
const AUDIENCE_QUALIFIER = /(?<![а-яё])(для|при|если)(?![а-яё])|участник|слушател|докладчик/iu;
const PAID_WORD = /платн\w*/iu;

export type EventPrice =
  | { readonly kind: 'absent' }
  | { readonly kind: 'free'; readonly text?: string }
  | { readonly kind: 'exact'; readonly amount: number; readonly currency: string; readonly text: string }
  | { readonly kind: 'from'; readonly amount: number; readonly currency: string; readonly text: string }
  | { readonly kind: 'unparsed'; readonly text: string };

function toNumber(raw: string): number {
  return Number(raw.replaceAll(/[\s  ]/gu, '').replace(',', '.'));
}

/**
 * The catalogue writes prices as prose, and most of that prose is not a price.
 *
 * The parser is deliberately timid. "Онлайн — 100 000 руб., Очно — 130 000 руб." names two
 * prices and no way to know which applies; "Для представителей организаций ОПК — 37 800
 * рублей" is a price for somebody else; "5 мест с грантом на 100% стоимости обучения" has
 * numbers and no money in it at all. Every one of those is real catalogue text, and every one
 * is shown to the traveller as written rather than folded into a total.
 */
export function parseEventPrice(raw: string | undefined, isFree?: boolean): EventPrice {
  const text = raw?.trim() ?? '';

  if (text === '') return isFree === true ? { kind: 'free' } : { kind: 'absent' };

  // "бесплатно" contains "платно", so the free words go before the paid ones are looked for.
  const withoutFree = text.replaceAll(FREE_WORD, '');
  const saysFree = withoutFree.length < text.length;
  const saysPaid = PAID_WORD.test(withoutFree);
  // A qualifier turns a price into somebody else's price, and the catalogue never says whose.
  const qualified = AUDIENCE_QUALIFIER.test(text);

  const lowerBound = PRICE_FROM.exec(text);
  if (lowerBound?.[1] !== undefined && !qualified) {
    return { kind: 'from', amount: toNumber(lowerBound[1]), currency: RUB, text };
  }

  const amounts = [...text.matchAll(PRICE_ANYWHERE)];
  const only = amounts[0]?.[1];
  if (amounts.length === 1 && only !== undefined && !saysPaid && !saysFree && !qualified) {
    return { kind: 'exact', amount: toNumber(only), currency: RUB, text };
  }

  if (saysFree && !saysPaid && amounts.length === 0) return { kind: 'free', text };

  return { kind: 'unparsed', text };
}

export type CostPart = 'outbound' | 'back' | 'hotel' | 'event';

export type CostLine = {
  readonly part: CostPart;
  readonly amount: number;
  readonly currency: string;
};

export type BudgetNote = {
  readonly limit: number;
  /** Negative when the trip does not fit. Shown as an overflow badge, never as an empty screen. */
  readonly remaining: number;
  /** True only when the trip definitely costs more than the budget. */
  readonly exceeded: boolean;
  /**
   * True when the total is a lower bound or is missing a part, so the trip may cost more than
   * the figure says. A budget verdict on such a total is a guess, and it is labelled as one.
   */
  readonly couldExceed: boolean;
};

export type TripCostInput = {
  readonly outbound?: Money;
  readonly back?: Money;
  /** `price_basis: "stay_total"`, the whole stay. Never multiplied by the night count. */
  readonly hotel?: Money;
  /** Required, because an omitted night count would let a hotel-less total look complete. */
  readonly nights: number;
  readonly eventPrice: EventPrice;
  readonly budget?: number;
};

export type TripCost = {
  readonly total: number;
  readonly currency: string;
  /** True when a part of the total was itself a lower bound, so the total cannot be exact. */
  readonly isLowerBound: boolean;
  /** False when a mandatory part is missing; such a figure is not the full price of taking part. */
  readonly complete: boolean;
  readonly missing: readonly CostPart[];
  readonly breakdown: readonly CostLine[];
  readonly eventPriceExcluded: boolean;
  /** What the catalogue wrote, so the screen can show it verbatim when it is not a number. */
  readonly eventPriceText?: string;
  readonly budget?: BudgetNote;
};

export function priceTrip(input: TripCostInput): TripCost {
  if (!Number.isInteger(input.nights) || input.nights < 0) {
    throw new RangeError(`A stay cannot be ${input.nights} nights long`);
  }

  const parts: readonly (readonly [CostPart, Money | undefined])[] = [
    ['outbound', input.outbound],
    ['hotel', input.hotel],
    ['back', input.back],
  ];

  const priced = input.eventPrice;
  const eventMoney: Money | undefined =
    priced.kind === 'exact' || priced.kind === 'from'
      ? { amount: priced.amount, currency: priced.currency }
      : undefined;

  const currencies = new Set(
    [...parts.map(([, money]) => money), eventMoney].flatMap((money) =>
      money === undefined ? [] : [money.currency],
    ),
  );
  if (currencies.size > 1) {
    throw new RangeError(`A trip cannot be priced in two currencies: ${[...currencies].join(', ')}`);
  }
  const currency = currencies.values().next().value ?? RUB;

  const breakdown: CostLine[] = parts.flatMap(([part, money]) =>
    money === undefined ? [] : [{ part, amount: money.amount, currency }],
  );
  if (eventMoney !== undefined) {
    breakdown.push({ part: 'event', amount: eventMoney.amount, currency });
  }

  const minor = breakdown.reduce(
    (running, line) => running + Math.round(line.amount * MINOR_UNITS),
    0,
  );

  // A trip without a return leg has a knowably wrong total, and a multi-night trip without a
  // hotel is not a trip. Either way the number stops being the full price of taking part.
  const missing: CostPart[] = [];
  if (input.outbound === undefined) missing.push('outbound');
  if (input.back === undefined) missing.push('back');
  if (input.hotel === undefined && input.nights > 0) missing.push('hotel');

  const isLowerBound = priced.kind === 'from';
  const understated = isLowerBound || missing.length > 0 || priced.kind === 'unparsed';

  return {
    total: minor / MINOR_UNITS,
    currency,
    isLowerBound,
    complete: missing.length === 0,
    missing,
    breakdown,
    eventPriceExcluded: priced.kind === 'unparsed',
    ...(priced.kind === 'absent' || priced.text === undefined ? {} : { eventPriceText: priced.text }),
    ...(input.budget === undefined
      ? {}
      : {
          budget: {
            limit: input.budget,
            remaining: (Math.round(input.budget * MINOR_UNITS) - minor) / MINOR_UNITS,
            exceeded: minor > Math.round(input.budget * MINOR_UNITS),
            couldExceed: understated && minor <= Math.round(input.budget * MINOR_UNITS),
          },
        }),
  };
}

/** Working hours, the window a day is burnt by being away during. */
const WORK_STARTS_MINUTES = 10 * 60;
const WORK_ENDS_MINUTES = 19 * 60;
const MS_PER_DAY = 86_400_000;

export type WorkingDaysInput = {
  /** When the traveller leaves home, and when they get back. Both with their offsets. */
  readonly outboundDepartureAt: IsoDateTime;
  readonly returnArrivalAt: IsoDateTime;
  /**
   * The production calendar as data, one entry per day, `true` for a working day.
   *
   * Data rather than a lookup function on purpose: a callback lets a caller smuggle I/O or L2
   * state into a function this layer promises is pure, and nothing would catch it.
   */
  readonly workingDays: Readonly<Record<IsoDate, boolean>>;
};

function localDay(value: IsoDateTime): IsoDate {
  return value.slice(0, 10);
}

function localMinutes(value: IsoDateTime): number {
  const parts = /[T ](\d{2}):(\d{2})/.exec(value);
  if (parts?.[1] === undefined || parts[2] === undefined) return 0;
  return Number(parts[1]) * 60 + Number(parts[2]);
}

function addDays(day: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * How many working days the trip actually costs.
 *
 * Counted over the real journeys rather than over the hotel booking, and that is the whole
 * point. Over the stay interval the figure is identical for every variant, the "Без отпуска"
 * card collapses into a copy of "Дешевле всего", and it stops meaning anything. Over the
 * journeys a night train leaving at 23:15 on Friday does not burn Friday and a 14:00 flight
 * does.
 */
export function countWorkingDaysBurnt(input: WorkingDaysInput): number | undefined {
  const first = localDay(input.outboundDepartureAt);
  const last = localDay(input.returnArrivalAt);
  if (last < first) return undefined;

  let burnt = 0;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const working = input.workingDays[day];
    // The calendar says nothing about this day, so no number is invented for the whole trip.
    if (working === undefined) return undefined;
    if (!working) continue;

    // On the day of departure the traveller works until they leave, and on the day they get
    // back they work from the moment they arrive. Only an overlap with the working window counts.
    if (day === first && localMinutes(input.outboundDepartureAt) >= WORK_ENDS_MINUTES) continue;
    if (day === last && localMinutes(input.returnArrivalAt) <= WORK_STARTS_MINUTES) continue;

    burnt += 1;
  }
  return burnt;
}
