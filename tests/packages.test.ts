import { describe, expect, it } from 'vitest';
import { choosePackages, type TripVariant } from '../src/composer/packages.ts';
import type { TripCost } from '../src/composer/pricing.ts';
import type { Feasibility } from '../src/composer/feasibility.ts';

const WORKS: Feasibility = { makesTheOpening: true, canBePrimary: true, notes: [] };
const MISSES: Feasibility = { makesTheOpening: false, canBePrimary: false, notes: [] };

function cost(total: number, budget?: { limit: number; couldExceed?: boolean }): TripCost {
  return {
    total,
    currency: 'RUB',
    isLowerBound: false,
    complete: true,
    missing: [],
    breakdown: [{ part: 'outbound', amount: total, currency: 'RUB' }],
    eventPriceExcluded: false,
    ...(budget === undefined
      ? {}
      : {
          budget: {
            limit: budget.limit,
            remaining: budget.limit - total,
            exceeded: total > budget.limit,
            couldExceed: budget.couldExceed ?? false,
          },
        }),
  };
}

function variant(
  id: string,
  total: number,
  durationMin: number,
  extra: {
    workingDays?: number;
    feasibility?: Feasibility;
    budget?: { limit: number; couldExceed?: boolean };
  } = {},
): TripVariant {
  return {
    id,
    cost: cost(total, extra.budget),
    feasibility: extra.feasibility ?? WORKS,
    totalDurationMin: durationMin,
    ...(extra.workingDays === undefined ? {} : { workingDaysBurnt: extra.workingDays }),
  };
}

describe('choosePackages', () => {
  it('gives one card per rule when three different trips win', () => {
    const result = choosePackages([
      variant('cheap', 16000, 1500, { workingDays: 3 }),
      variant('leave', 21000, 1400, { workingDays: 1 }),
      variant('fast', 24000, 200, { workingDays: 2 }),
    ]);

    expect(result.packages.map((entry) => [entry.variant.id, entry.rules])).toEqual([
      ['cheap', ['cheapest']],
      ['leave', ['no-leave']],
      ['fast', ['fastest']],
    ]);
  });

  it('collapses two rules onto one card rather than showing it twice', () => {
    const result = choosePackages([
      variant('both', 16000, 200, { workingDays: 3 }),
      variant('other', 21000, 1400, { workingDays: 1 }),
    ]);

    expect(result.packages).toHaveLength(2);
    expect(result.packages[0]?.rules).toEqual(['cheapest', 'fastest']);
  });

  it('collapses all three rules onto a single card', () => {
    const result = choosePackages([
      variant('winner', 16000, 200, { workingDays: 1 }),
      variant('loser', 21000, 1400, { workingDays: 3 }),
    ]);

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.rules).toEqual(['cheapest', 'no-leave', 'fastest']);
  });

  it('does not offer a trip that misses the opening while a workable one exists', () => {
    const result = choosePackages([
      variant('works', 21000, 1400, { workingDays: 3 }),
      variant('late', 9000, 200, { workingDays: 1, feasibility: MISSES }),
    ]);

    expect(result.packages.every((entry) => entry.variant.id === 'works')).toBe(true);
  });

  it('shows the flagged trips rather than an empty screen when nothing makes the opening', () => {
    const result = choosePackages([variant('late', 21000, 1400, { workingDays: 3, feasibility: MISSES })]);

    expect(result.packages).toHaveLength(1);
    expect(result.notes).toContain('no-feasible-variant');
  });

  it('prefers a trip inside the budget over a cheaper one outside it', () => {
    const result = choosePackages([
      variant('fits', 20000, 1400, { workingDays: 3, budget: { limit: 30000 } }),
      variant('over', 40000, 200, { workingDays: 1, budget: { limit: 30000 } }),
    ]);

    expect(result.packages.every((entry) => entry.variant.id === 'fits')).toBe(true);
  });

  it('shows the cheapest with a warning when nothing fits the budget', () => {
    const result = choosePackages([
      variant('dear', 40000, 1400, { workingDays: 3, budget: { limit: 30000 } }),
      variant('dearer', 50000, 200, { workingDays: 1, budget: { limit: 30000 } }),
    ]);

    expect(result.packages[0]?.variant.id).toBe('dear');
    expect(result.notes).toContain('over-budget');
  });

  it('warns when the budget verdict rests on an understated total', () => {
    const result = choosePackages([
      variant('unsure', 20000, 1400, { workingDays: 3, budget: { limit: 30000, couldExceed: true } }),
    ]);

    expect(result.notes).toContain('budget-uncertain');
  });

  it('does not invent a leave card without a production calendar', () => {
    const result = choosePackages([variant('a', 16000, 1500), variant('b', 24000, 200)]);

    expect(result.packages.flatMap((entry) => entry.rules)).not.toContain('no-leave');
  });

  it('says why the leave card is missing', () => {
    const result = choosePackages([variant('a', 16000, 1500), variant('b', 24000, 200)]);

    expect(result.notes).toContain('no-working-day-data');
  });

  it('still picks a leave card when only some trips have a working-day count', () => {
    const result = choosePackages([
      variant('counted', 24000, 1400, { workingDays: 2 }),
      variant('uncounted', 16000, 200),
    ]);

    const leave = result.packages.find((entry) => entry.rules.includes('no-leave'));

    expect(leave?.variant.id).toBe('counted');
  });

  it('breaks a leave tie by price', () => {
    const result = choosePackages([
      variant('dear', 24000, 1400, { workingDays: 1 }),
      variant('cheap', 16000, 1500, { workingDays: 1 }),
    ]);

    expect(result.packages.find((entry) => entry.rules.includes('no-leave'))?.variant.id).toBe(
      'cheap',
    );
  });

  it('breaks a price tie by time on the road', () => {
    const result = choosePackages([
      variant('slow', 16000, 1500, { workingDays: 2 }),
      variant('quick', 16000, 200, { workingDays: 2 }),
    ]);

    expect(result.packages[0]?.variant.id).toBe('quick');
  });

  it('answers the same whichever order the variants arrived in', () => {
    const list = [
      variant('b', 16000, 1500, { workingDays: 3 }),
      variant('a', 16000, 1500, { workingDays: 3 }),
    ];

    const forwards = choosePackages(list);
    const backwards = choosePackages([...list].reverse());

    expect(forwards).toEqual(backwards);
    expect(forwards.packages[0]?.variant.id).toBe('a');
  });

  it('returns nothing for nothing rather than failing', () => {
    expect(choosePackages([])).toEqual({ packages: [], notes: [] });
  });

  it('never offers more than three cards', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      variant(`v${index}`, 10000 + index * 100, 1000 - index * 10, { workingDays: index }),
    );

    expect(choosePackages(many).packages.length).toBeLessThanOrEqual(3);
  });
});
