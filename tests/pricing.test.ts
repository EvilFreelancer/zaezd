import { describe, expect, it } from 'vitest';
import { countWorkingDaysBurnt, parseEventPrice, priceTrip } from '../src/composer/pricing.ts';

const RUB = 'RUB';

describe('parseEventPrice', () => {
  it('reads a plain amount with a currency', () => {
    expect(parseEventPrice('13000 р.')).toMatchObject({ kind: 'exact', amount: 13000 });
  });

  it('names the currency it read', () => {
    expect(parseEventPrice('13000 р.')).toMatchObject({ currency: RUB });
  });

  it('reads an amount written with a thousands space', () => {
    expect(parseEventPrice('7 000 ₽')).toMatchObject({ kind: 'exact', amount: 7000 });
  });

  it('reads an amount written with a non-breaking space', () => {
    expect(parseEventPrice('7 000 ₽')).toMatchObject({ kind: 'exact', amount: 7000 });
  });

  it('reads a price behind a label', () => {
    expect(parseEventPrice('Цена 13 000 ₽')).toMatchObject({ kind: 'exact', amount: 13000 });
  });

  it('reads "от" as a lower bound rather than as a price', () => {
    expect(parseEventPrice('от 7 000 ₽')).toMatchObject({ kind: 'from', amount: 7000 });
  });

  it('reads a range as its lower bound', () => {
    const price = parseEventPrice('от 7 900 ₽ до 13 700 ₽ (офлайн, один день)');

    expect(price).toMatchObject({ kind: 'from', amount: 7900 });
  });

  it('refuses a lower bound that only applies to some of the audience', () => {
    // The exact branch already refuses these; the "от" branch used to walk straight past.
    expect(parseEventPrice('от 7 000 ₽ для слушателей').kind).toBe('unparsed');
  });

  it('recognises a free event', () => {
    expect(parseEventPrice('бесплатно').kind).toBe('free');
  });

  it('recognises a free event whatever the case', () => {
    expect(parseEventPrice('Бесплатно').kind).toBe('free');
  });

  it('trusts the catalogue flag when the text says nothing', () => {
    expect(parseEventPrice('', true).kind).toBe('free');
  });

  it('refuses to pick between two prices in one line', () => {
    // Which one applies depends on a choice the catalogue never states.
    expect(parseEventPrice('Онлайн — 100 000 руб., Очно — 130 000 руб.').kind).toBe('unparsed');
  });

  it('refuses a price that only applies to some of the audience', () => {
    expect(parseEventPrice('Для представителей организаций ОПК — 37 800 рублей').kind).toBe(
      'unparsed',
    );
  });

  it('does not mistake a percentage and a seat count for money', () => {
    const price = parseEventPrice(
      '5 мест с грантом на 100% стоимости обучения, остальные — 25 платных мест',
    );

    expect(price.kind).toBe('unparsed');
  });

  it('refuses a line that is free for some and paid for others', () => {
    expect(parseEventPrice('Бесплатно для слушателей; для докладчиков — платно').kind).toBe(
      'unparsed',
    );
  });

  it('refuses a line with no number in it at all', () => {
    expect(parseEventPrice('уточняется у организатора').kind).toBe('unparsed');
  });

  it('reports an absent price as absent rather than as unreadable', () => {
    expect(parseEventPrice(undefined).kind).toBe('absent');
  });

  it('keeps the original text so the screen can show what the catalogue wrote', () => {
    const price = parseEventPrice('уточняется у организатора');

    expect(price).toMatchObject({ text: 'уточняется у организатора' });
  });
});

describe('priceTrip', () => {
  const legs = {
    outbound: { amount: 2090.93, currency: RUB },
    back: { amount: 2090.93, currency: RUB },
  };
  const noEventPrice = parseEventPrice(undefined);

  it('adds both journeys and the whole stay', () => {
    const cost = priceTrip({
      ...legs,
      nights: 4,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: noEventPrice,
    });

    expect(cost.total).toBe(16981.86);
  });

  it('adds fractional fares without floating-point dust', () => {
    const cost = priceTrip({
      outbound: { amount: 0.1, currency: RUB },
      back: { amount: 0.2, currency: RUB },
      nights: 0,
      eventPrice: noEventPrice,
    });

    expect(cost.total).toBe(0.3);
  });

  it('never multiplies the hotel price by the number of nights', () => {
    const cost = priceTrip({
      ...legs,
      hotel: { amount: 12800, currency: RUB },
      nights: 4,
      eventPrice: noEventPrice,
    });

    expect(cost.total).toBe(16981.86);
  });

  it('leaves a free-text event price out of the sum', () => {
    const cost = priceTrip({
      ...legs,
      nights: 0,
      eventPrice: parseEventPrice('уточняется у организатора'),
    });

    expect(cost).toMatchObject({ total: 4181.86, eventPriceExcluded: true });
  });

  it('carries the free text forward so the screen can show it verbatim', () => {
    const cost = priceTrip({
      ...legs,
      nights: 0,
      eventPrice: parseEventPrice('уточняется у организатора'),
    });

    expect(cost.eventPriceText).toBe('уточняется у организатора');
  });

  it('includes an event price it could read', () => {
    const cost = priceTrip({ ...legs, nights: 0, eventPrice: parseEventPrice('13000 р.') });

    expect(cost).toMatchObject({ total: 17181.86, eventPriceExcluded: false });
  });

  it('makes the whole total a lower bound when the event price is one', () => {
    const cost = priceTrip({ ...legs, nights: 0, eventPrice: parseEventPrice('от 7 000 ₽') });

    expect(cost).toMatchObject({ total: 11181.86, isLowerBound: true });
  });

  it('does not call a total a lower bound when every part is exact', () => {
    const cost = priceTrip({ ...legs, nights: 0, eventPrice: parseEventPrice('бесплатно') });

    expect(cost.isLowerBound).toBe(false);
  });

  it('calls a trip complete when both journeys are there and no hotel is needed', () => {
    const cost = priceTrip({ ...legs, nights: 0, eventPrice: parseEventPrice('бесплатно') });

    expect(cost).toMatchObject({ complete: true, missing: [] });
  });

  it('refuses to call a total the full price when the journey home is missing', () => {
    const cost = priceTrip({
      outbound: legs.outbound,
      hotel: { amount: 12800, currency: RUB },
      nights: 4,
      eventPrice: noEventPrice,
    });

    expect(cost).toMatchObject({ complete: false, missing: ['back'] });
  });

  it('refuses to call a total the full price when a needed hotel is missing', () => {
    const cost = priceTrip({ ...legs, nights: 4, eventPrice: noEventPrice });

    expect(cost).toMatchObject({ complete: false, missing: ['hotel'] });
  });

  it('refuses a night count that could not exist', () => {
    expect(() => priceTrip({ ...legs, nights: -1, eventPrice: noEventPrice })).toThrow(/-1/);
  });

  it('breaks the total down into lines that add up to the arithmetic on the card', () => {
    const cost = priceTrip({
      ...legs,
      nights: 4,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: parseEventPrice('13000 р.'),
    });

    expect(cost.breakdown.map((line) => line.amount)).toEqual([2090.93, 12800, 2090.93, 13000]);
    expect(cost.total).toBe(29981.86);
  });

  it('names each line of the breakdown', () => {
    const cost = priceTrip({
      ...legs,
      nights: 4,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: parseEventPrice('13000 р.'),
    });

    expect(cost.breakdown.map((line) => line.part)).toEqual(['outbound', 'hotel', 'back', 'event']);
  });

  it('shows a budget that does not fit as exceeded', () => {
    const cost = priceTrip({
      outbound: { amount: 9000, currency: RUB },
      back: { amount: 9000, currency: RUB },
      hotel: { amount: 15000, currency: RUB },
      nights: 4,
      budget: 30000,
      eventPrice: noEventPrice,
    });

    expect(cost.budget).toMatchObject({ limit: 30000, remaining: -3000, exceeded: true });
  });

  it('does not call a budget met exactly an overflow', () => {
    const cost = priceTrip({
      outbound: { amount: 9000, currency: RUB },
      back: { amount: 9000, currency: RUB },
      hotel: { amount: 12000, currency: RUB },
      nights: 4,
      budget: 30000,
      eventPrice: noEventPrice,
    });

    expect(cost.budget).toMatchObject({ remaining: 0, exceeded: false, couldExceed: false });
  });

  it('will not promise a budget fits when the total is only a lower bound', () => {
    // 1000 + 1000 + "от 7 000" leaves 1000 on paper and possibly nothing at all in reality.
    const cost = priceTrip({
      outbound: { amount: 1000, currency: RUB },
      back: { amount: 1000, currency: RUB },
      nights: 0,
      budget: 10000,
      eventPrice: parseEventPrice('от 7 000 ₽'),
    });

    expect(cost.budget).toMatchObject({ exceeded: false, couldExceed: true });
  });

  it('will not promise a budget fits when a part of the trip is missing', () => {
    const cost = priceTrip({
      outbound: { amount: 1000, currency: RUB },
      nights: 4,
      budget: 10000,
      eventPrice: noEventPrice,
    });

    expect(cost.budget?.couldExceed).toBe(true);
  });

  it('will not promise a budget fits when the event price could not be read', () => {
    const cost = priceTrip({
      ...legs,
      nights: 0,
      budget: 10000,
      eventPrice: parseEventPrice('уточняется у организатора'),
    });

    expect(cost.budget?.couldExceed).toBe(true);
  });

  it('says nothing about a budget nobody set', () => {
    const cost = priceTrip({ ...legs, nights: 0, eventPrice: noEventPrice });

    expect(cost.budget).toBeUndefined();
  });

  it('refuses to add two currencies rather than pretending they are the same', () => {
    expect(() =>
      priceTrip({
        outbound: { amount: 100, currency: RUB },
        back: { amount: 100, currency: 'EUR' },
        nights: 0,
        eventPrice: noEventPrice,
      }),
    ).toThrow(/EUR/);
  });

  it('refuses an event price in a currency the journeys are not in', () => {
    expect(() =>
      priceTrip({
        outbound: { amount: 100, currency: 'EUR' },
        back: { amount: 100, currency: 'EUR' },
        nights: 0,
        eventPrice: parseEventPrice('7 000 ₽'),
      }),
    ).toThrow(/RUB/);
  });

  it('prices the whole trip exactly, so a later change cannot slip through unnoticed', () => {
    const cost = priceTrip({
      ...legs,
      nights: 4,
      hotel: { amount: 12800, currency: RUB },
      budget: 20000,
      eventPrice: parseEventPrice('бесплатно'),
    });

    expect(cost).toEqual({
      total: 16981.86,
      currency: RUB,
      isLowerBound: false,
      complete: true,
      missing: [],
      breakdown: [
        { part: 'outbound', amount: 2090.93, currency: RUB },
        { part: 'hotel', amount: 12800, currency: RUB },
        { part: 'back', amount: 2090.93, currency: RUB },
      ],
      eventPriceExcluded: false,
      eventPriceText: 'бесплатно',
      budget: { limit: 20000, remaining: 3018.14, exceeded: false, couldExceed: false },
    });
  });
});

describe('countWorkingDaysBurnt', () => {
  const allWorking = (): boolean => true;
  const allOff = (): boolean => false;

  it('burns nothing on a trip that runs over a weekend', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T20:00:00+03:00',
      returnArrivalAt: '2026-08-30T09:00:00+03:00',
      isWorkingDay: allOff,
    });

    expect(burnt).toBe(0);
  });

  it('does not burn the departure day when the traveller leaves after work', () => {
    // A night train at 23:15 costs no working time at all on the day it leaves.
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T23:15:00+03:00',
      returnArrivalAt: '2026-08-29T20:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(burnt).toBe(1);
  });

  it('burns the departure day when the traveller leaves in the middle of it', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T14:00:00+03:00',
      returnArrivalAt: '2026-08-29T20:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(burnt).toBe(2);
  });

  it('tells a night departure and a midday one apart, which is the whole point of the card', () => {
    const night = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T23:15:00+03:00',
      returnArrivalAt: '2026-08-30T22:00:00+03:00',
      isWorkingDay: allWorking,
    });
    const midday = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T14:00:00+03:00',
      returnArrivalAt: '2026-08-30T22:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(night).toBe(2);
    expect(midday).toBe(3);
  });

  it('does not burn the day home when the traveller is back before work starts', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-28T23:15:00+03:00',
      returnArrivalAt: '2026-08-30T07:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(burnt).toBe(1);
  });

  it('counts only the days the calendar calls working', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-26T09:00:00+03:00',
      returnArrivalAt: '2026-08-30T20:00:00+03:00',
      isWorkingDay: (day) => day !== '2026-08-29' && day !== '2026-08-30',
    });

    expect(burnt).toBe(3);
  });

  it('counts a trip that crosses the end of a month', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-10-30T09:00:00+03:00',
      returnArrivalAt: '2026-11-02T20:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(burnt).toBe(4);
  });

  it('invents no number when the calendar could not answer', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-26T09:00:00+03:00',
      returnArrivalAt: '2026-08-30T20:00:00+03:00',
      isWorkingDay: () => undefined,
    });

    expect(burnt).toBeUndefined();
  });

  it('answers nothing for a journey that gets home before it left', () => {
    const burnt = countWorkingDaysBurnt({
      outboundDepartureAt: '2026-08-30T09:00:00+03:00',
      returnArrivalAt: '2026-08-26T20:00:00+03:00',
      isWorkingDay: allWorking,
    });

    expect(burnt).toBeUndefined();
  });
});
