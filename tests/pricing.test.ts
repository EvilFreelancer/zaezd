import { describe, expect, it } from 'vitest';
import { parseEventPrice, priceTrip } from '../src/composer/pricing.ts';

const RUB = 'RUB';

describe('parseEventPrice', () => {
  it('reads a plain amount with a currency', () => {
    expect(parseEventPrice('13000 р.')).toMatchObject({ kind: 'exact', amount: 13000 });
  });

  it('reads an amount written with a thousands space', () => {
    expect(parseEventPrice('7 000 ₽')).toMatchObject({ kind: 'exact', amount: 7000 });
  });

  it('reads an amount written with a non-breaking space', () => {
    expect(parseEventPrice('7 000 ₽')).toMatchObject({ kind: 'exact', amount: 7000 });
  });

  it('reads "от" as a lower bound rather than as a price', () => {
    expect(parseEventPrice('от 7 000 ₽')).toMatchObject({ kind: 'from', amount: 7000 });
  });

  it('reads a range as its lower bound', () => {
    const price = parseEventPrice('от 7 900 ₽ до 13 700 ₽ (офлайн, один день)');

    expect(price).toMatchObject({ kind: 'from', amount: 7900 });
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

  it('adds both journeys and the whole stay', () => {
    const cost = priceTrip({
      ...legs,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost.total).toBe(16981.86);
  });

  it('adds fractional fares without floating-point dust', () => {
    const cost = priceTrip({
      outbound: { amount: 0.1, currency: RUB },
      back: { amount: 0.2, currency: RUB },
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost.total).toBe(0.3);
  });

  it('never multiplies the hotel price by the number of nights', () => {
    const cost = priceTrip({
      ...legs,
      hotel: { amount: 12800, currency: RUB },
      nights: 4,
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost.total).toBe(16981.86);
  });

  it('leaves a free-text event price out of the sum', () => {
    const cost = priceTrip({ ...legs, eventPrice: parseEventPrice('уточняется у организатора') });

    expect(cost).toMatchObject({ total: 4181.86, eventPriceExcluded: true });
  });

  it('includes an event price it could read', () => {
    const cost = priceTrip({ ...legs, eventPrice: parseEventPrice('13000 р.') });

    expect(cost).toMatchObject({ total: 17181.86, eventPriceExcluded: false });
  });

  it('makes the whole total a lower bound when the event price is one', () => {
    const cost = priceTrip({ ...legs, eventPrice: parseEventPrice('от 7 000 ₽') });

    expect(cost).toMatchObject({ total: 11181.86, isLowerBound: true });
  });

  it('does not call a total a lower bound when every part is exact', () => {
    const cost = priceTrip({ ...legs, eventPrice: parseEventPrice('бесплатно') });

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
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost).toMatchObject({ complete: false, missing: ['back'] });
  });

  it('refuses to call a total the full price when a needed hotel is missing', () => {
    const cost = priceTrip({ ...legs, nights: 4, eventPrice: parseEventPrice(undefined) });

    expect(cost).toMatchObject({ complete: false, missing: ['hotel'] });
  });

  it('breaks the total down into lines that add up to it', () => {
    const cost = priceTrip({
      ...legs,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: parseEventPrice('13000 р.'),
    });

    const sum = cost.breakdown.reduce((running, line) => running + line.amount, 0);

    expect(Math.round(sum * 100) / 100).toBe(cost.total);
  });

  it('names each line of the breakdown', () => {
    const cost = priceTrip({
      ...legs,
      hotel: { amount: 12800, currency: RUB },
      eventPrice: parseEventPrice('13000 р.'),
    });

    expect(cost.breakdown.map((line) => line.part)).toEqual([
      'outbound',
      'hotel',
      'back',
      'event',
    ]);
  });

  it('shows a budget that does not fit as exceeded', () => {
    const cost = priceTrip({
      outbound: { amount: 9000, currency: RUB },
      back: { amount: 9000, currency: RUB },
      hotel: { amount: 15000, currency: RUB },
      budget: 30000,
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost.budget).toMatchObject({ limit: 30000, remaining: -3000, exceeded: true });
  });

  it('does not call a budget met exactly an overflow', () => {
    const cost = priceTrip({
      outbound: { amount: 9000, currency: RUB },
      back: { amount: 9000, currency: RUB },
      hotel: { amount: 12000, currency: RUB },
      budget: 30000,
      eventPrice: parseEventPrice(undefined),
    });

    expect(cost.budget).toMatchObject({ remaining: 0, exceeded: false });
  });

  it('says nothing about a budget nobody set', () => {
    const cost = priceTrip({ ...legs, eventPrice: parseEventPrice(undefined) });

    expect(cost.budget).toBeUndefined();
  });

  it('refuses to add two currencies rather than pretending they are the same', () => {
    expect(() =>
      priceTrip({
        outbound: { amount: 100, currency: RUB },
        back: { amount: 100, currency: 'EUR' },
        eventPrice: parseEventPrice(undefined),
      }),
    ).toThrow(/EUR/);
  });

  it('answers identically every time it is asked', () => {
    const input = { ...legs, hotel: { amount: 12800, currency: RUB }, eventPrice: parseEventPrice('от 7 000 ₽') };

    expect(priceTrip(input)).toEqual(priceTrip(input));
  });
});
