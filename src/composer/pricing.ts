/**
 * What the trip costs, and what the product refuses to guess.
 *
 * The headline figure is the price of taking part, not the price of a ticket: getting there,
 * sleeping somewhere, getting back, and the event itself. Every part comes from its own source
 * and keeps its own name, and a part nobody could read stays out of the sum instead of being
 * rounded into it.
 *
 * Specified in `specs/04-kompozitor.md`, steps 6 and 7.
 */
import type { Money } from './types.ts';

/** Money is added in whole kopecks. 2090.93 + 2090.93 in floats is not 4181.86. */
const MINOR_UNITS = 100;

const AMOUNT = String.raw`\d[\d\s  ]*(?:[.,]\d+)?`;
const CURRENCY = String.raw`(?:₽|руб\.?|рублей|рубля|р\.)`;

const PRICE_ANYWHERE = new RegExp(`(${AMOUNT})\\s*${CURRENCY}`, 'giu');
const PRICE_FROM = new RegExp(`^\\s*от\\s+(${AMOUNT})\\s*${CURRENCY}`, 'iu');
const FREE_WORD = /бесплатн\w*/giu;
const PAID_WORD = /платн\w*|стоимост\w*|цена/iu;

export type EventPrice =
  | { readonly kind: 'absent' }
  | { readonly kind: 'free'; readonly text?: string }
  | { readonly kind: 'exact'; readonly amount: number; readonly text: string }
  | { readonly kind: 'from'; readonly amount: number; readonly text: string }
  | { readonly kind: 'unparsed'; readonly text: string };

function toNumber(raw: string): number {
  return Number(raw.replaceAll(/[\s  ]/gu, '').replace(',', '.'));
}

/**
 * The catalogue writes prices as prose, and most of that prose is not a price.
 *
 * The parser is deliberately timid. "Онлайн — 100 000 руб., Очно — 130 000 руб." names two
 * prices and no way to know which applies; "Для представителей организаций ОПК — 37 800
 * рублей" is a price for somebody else; "5 мест с грантом на 100% стоимости" has numbers and
 * no money in it at all. Every one of those is real catalogue text, and every one of them is
 * shown to the traveller as written rather than folded into a total.
 */
export function parseEventPrice(raw: string | undefined, isFree?: boolean): EventPrice {
  const text = raw?.trim() ?? '';

  if (text === '') return isFree === true ? { kind: 'free' } : { kind: 'absent' };

  // "бесплатно" contains "платно", so the free words go before the paid ones are looked for.
  const withoutFree = text.replaceAll(FREE_WORD, '');
  const saysFree = withoutFree.length < text.length;
  const saysPaid = PAID_WORD.test(withoutFree);

  const lowerBound = PRICE_FROM.exec(text);
  if (lowerBound?.[1] !== undefined) {
    return { kind: 'from', amount: toNumber(lowerBound[1]), text };
  }

  const amounts = [...text.matchAll(PRICE_ANYWHERE)];
  if (amounts.length === 1 && !saysPaid && !saysFree) {
    const only = amounts[0]?.[1];
    // A qualifier turns a price into somebody else's price, and the catalogue never says whose.
    // The boundaries are spelled out because JavaScript's \b is ASCII-only and never fires
    // next to a Cyrillic letter, which would let "Для представителей ОПК" through as a price.
    const qualified =
      /(?<![а-яё])(для|при|если)(?![а-яё])|участник|слушател|докладчик/iu.test(text);
    if (only !== undefined && !qualified) return { kind: 'exact', amount: toNumber(only), text };
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
  readonly exceeded: boolean;
};

export type TripCostInput = {
  readonly outbound?: Money;
  readonly back?: Money;
  /** `price_basis: "stay_total"`, the whole stay. Never multiplied by the night count. */
  readonly hotel?: Money;
  readonly nights?: number;
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
  readonly budget?: BudgetNote;
};

function eventLine(price: EventPrice): number | undefined {
  return price.kind === 'exact' || price.kind === 'from' ? price.amount : undefined;
}

export function priceTrip(input: TripCostInput): TripCost {
  const parts: readonly (readonly [CostPart, Money | undefined])[] = [
    ['outbound', input.outbound],
    ['hotel', input.hotel],
    ['back', input.back],
  ];

  const currencies = new Set(
    parts.flatMap(([, money]) => (money === undefined ? [] : [money.currency])),
  );
  if (currencies.size > 1) {
    throw new RangeError(`A trip cannot be priced in two currencies: ${[...currencies].join(', ')}`);
  }
  const currency = currencies.values().next().value ?? 'RUB';

  const breakdown: CostLine[] = parts.flatMap(([part, money]) =>
    money === undefined ? [] : [{ part, amount: money.amount, currency }],
  );

  const event = eventLine(input.eventPrice);
  if (event !== undefined) breakdown.push({ part: 'event', amount: event, currency });

  const minor = breakdown.reduce((running, line) => running + Math.round(line.amount * MINOR_UNITS), 0);
  const total = minor / MINOR_UNITS;

  // A trip without a return leg has a knowably wrong total, and a multi-night trip without a
  // hotel is not a trip. Either way the number stops being the full price of taking part.
  const missing: CostPart[] = [];
  if (input.outbound === undefined) missing.push('outbound');
  if (input.back === undefined) missing.push('back');
  if (input.hotel === undefined && (input.nights ?? 0) > 0) missing.push('hotel');

  return {
    total,
    currency,
    isLowerBound: input.eventPrice.kind === 'from',
    complete: missing.length === 0,
    missing,
    breakdown,
    eventPriceExcluded: input.eventPrice.kind === 'unparsed',
    ...(input.budget === undefined
      ? {}
      : {
          budget: {
            limit: input.budget,
            remaining: (Math.round(input.budget * MINOR_UNITS) - minor) / MINOR_UNITS,
            exceeded: minor > Math.round(input.budget * MINOR_UNITS),
          },
        }),
  };
}
