/**
 * Three trips instead of a list of offers.
 *
 * The output of the product is not a feed. It is at most three assembled trips whose selection
 * rule is legible from the name alone: the cheapest, the one that costs the fewest working
 * days, and the fastest. When two rules land on the same trip the answer is fewer cards, not
 * the same card twice.
 *
 * L3 builds the combinations; this file only chooses among them, which is what keeps it pure
 * and exhaustively testable. Specified in `specs/04-kompozitor.md`, step 6.
 */
import type { Feasibility } from './feasibility.ts';
import type { TripCost } from './pricing.ts';

export type PackageRule = 'cheapest' | 'no-leave' | 'fastest';

/** The order the cards appear in, which is also the order the rules are applied in. */
const RULE_ORDER: readonly PackageRule[] = ['cheapest', 'no-leave', 'fastest'];

export type TripVariant = {
  readonly id: string;
  readonly cost: TripCost;
  readonly feasibility: Feasibility;
  /** Time in transit, both journeys together. */
  readonly totalDurationMin: number;
  /** Absent when the production calendar could not answer; then no number is invented. */
  readonly workingDaysBurnt?: number;
};

export type PackageNote =
  /** Nothing on offer makes the opening, so the cards are shown flagged rather than not at all. */
  | 'no-feasible-variant'
  /** Nothing fits the budget, so the cheapest is shown with an overflow badge. */
  | 'over-budget'
  /** The budget verdict rests on a total that may be understated. */
  | 'budget-uncertain'
  /** No production calendar, so the "no leave" card cannot be chosen honestly. */
  | 'no-working-day-data';

export type TripPackage = {
  /** More than one when several rules picked the same trip. Never two cards for one trip. */
  readonly rules: readonly PackageRule[];
  readonly variant: TripVariant;
};

export type PackagesResult = {
  readonly packages: readonly TripPackage[];
  readonly notes: readonly PackageNote[];
};

type Comparator = (left: TripVariant, right: TripVariant) => number;

/** The last tie-break is always the identifier, so array order can never decide a card. */
function byId(left: TripVariant, right: TripVariant): number {
  return left.id.localeCompare(right.id);
}

function byTotal(left: TripVariant, right: TripVariant): number {
  return left.cost.total - right.cost.total;
}

function byDuration(left: TripVariant, right: TripVariant): number {
  return left.totalDurationMin - right.totalDurationMin;
}

const RULES: Readonly<Record<PackageRule, { readonly compare: Comparator; readonly needs?: 'working-days' }>> =
  {
    cheapest: { compare: (left, right) => byTotal(left, right) || byDuration(left, right) || byId(left, right) },
    'no-leave': {
      needs: 'working-days',
      compare: (left, right) =>
        (left.workingDaysBurnt ?? 0) - (right.workingDaysBurnt ?? 0) ||
        byTotal(left, right) ||
        byId(left, right),
    },
    fastest: { compare: (left, right) => byDuration(left, right) || byTotal(left, right) || byId(left, right) },
  };

function fitsBudget(variant: TripVariant): boolean {
  const budget = variant.cost.budget;
  return budget === undefined || !budget.exceeded;
}

export function choosePackages(variants: readonly TripVariant[]): PackagesResult {
  if (variants.length === 0) return { packages: [], notes: [] };

  const notes: PackageNote[] = [];

  // A trip that misses the opening is not a cheaper trip. But if nothing makes the opening,
  // an empty screen is worse than a flagged one, so the cards are still shown and labelled.
  const feasible = variants.filter((variant) => variant.feasibility.canBePrimary);
  if (feasible.length === 0) notes.push('no-feasible-variant');
  const afterFeasibility = feasible.length > 0 ? feasible : variants;

  const affordable = afterFeasibility.filter(fitsBudget);
  if (affordable.length === 0) notes.push('over-budget');
  const pool = affordable.length > 0 ? affordable : afterFeasibility;

  if (pool.some((variant) => variant.cost.budget?.couldExceed === true)) {
    notes.push('budget-uncertain');
  }

  const chosen = new Map<string, PackageRule[]>();
  const order: string[] = [];

  for (const rule of RULE_ORDER) {
    const { compare, needs } = RULES[rule];
    const eligible =
      needs === 'working-days'
        ? pool.filter((variant) => variant.workingDaysBurnt !== undefined)
        : pool;

    if (eligible.length === 0) {
      if (needs === 'working-days') notes.push('no-working-day-data');
      continue;
    }

    const winner = [...eligible].sort(compare)[0] as TripVariant;
    const rules = chosen.get(winner.id);
    if (rules === undefined) {
      chosen.set(winner.id, [rule]);
      order.push(winner.id);
    } else {
      rules.push(rule);
    }
  }

  const byIdentifier = new Map(pool.map((variant) => [variant.id, variant]));
  return {
    packages: order.map((id) => ({
      rules: chosen.get(id) as PackageRule[],
      variant: byIdentifier.get(id) as TripVariant,
    })),
    notes,
  };
}
