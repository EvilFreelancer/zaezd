/**
 * The production calendar, which is what makes "Без отпуска" mean anything.
 *
 * isDayOff answers with a bare string of digits, one per day of the month, zero for a working
 * day. That is not JSON, and treating it as JSON turns "1100000110000011" into 1.1e15 with no
 * error at all - a calendar that is silently wrong rather than visibly missing.
 *
 * Optional, like everything in this layer: when it does not answer, the working-day figure is
 * absent and the card that depends on it is not shown. No number is invented.
 */
import { TTL, type TtlCache } from '../sources/cache.ts';
import { cacheKey } from '../sources/cache.ts';
import { optional, type HttpFetch } from './http.ts';
import type { IsoDate } from '../composer/types.ts';

const SOURCE = 'isdayoff';
const BASE = 'https://isdayoff.ru/api/getdata';

export type CalendarOptions = {
  readonly http: HttpFetch;
  readonly cache: TtlCache;
};

/** One month, as `{ '2026-08-01': true, ... }`. Absent when the source did not answer. */
export async function loadMonth(
  options: CalendarOptions,
  year: number,
  month: number,
): Promise<Readonly<Record<IsoDate, boolean>> | undefined> {
  const mm = String(month).padStart(2, '0');
  const args = { tool: 'getdata', year: String(year), month: mm };
  const url = `${BASE}?year=${year}&month=${mm}`;

  return optional(async () =>
    options.cache.through(cacheKey(SOURCE, 'getdata', { url, ...args }), TTL.productionCalendar, async () => {
      const answer = await options.http(url, args);
      if (answer.status !== 200 || typeof answer.body !== 'string') return undefined;

      const days = answer.body.trim();
      // Anything other than one digit per day means the format changed, and a calendar read
      // wrongly is worse than one that is missing.
      if (!/^[01]+$/.test(days)) return undefined;

      const marked: Record<IsoDate, boolean> = {};
      for (const [index, flag] of [...days].entries()) {
        marked[`${year}-${mm}-${String(index + 1).padStart(2, '0')}`] = flag === '0';
      }
      return marked;
    }),
  );
}

/**
 * Every day the trip touches, across however many months that is.
 *
 * A trip from 29 October to 1 November crosses a month boundary, and a calendar that stops at
 * the end of October would leave the last day unknown - which, correctly, makes the whole
 * count unknown rather than short by one.
 */
export async function loadCalendar(
  options: CalendarOptions,
  from: IsoDate,
  to: IsoDate,
): Promise<Readonly<Record<IsoDate, boolean>> | undefined> {
  if (to < from) return undefined;

  const months = new Set<string>();
  const first = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  for (
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    cursor <= last;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    months.add(`${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`);
  }

  const loaded = await Promise.all(
    [...months].map(async (key) => {
      const [year, month] = key.split('-');
      return loadMonth(options, Number(year), Number(month));
    }),
  );

  // One missing month makes the whole answer missing. A partial calendar would silently
  // undercount the working days of any trip that crosses into it.
  if (loaded.some((month) => month === undefined)) return undefined;

  return Object.assign({}, ...loaded) as Record<IsoDate, boolean>;
}
