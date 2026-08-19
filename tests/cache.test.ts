import { describe, expect, it } from 'vitest';
import { TtlCache, cacheKey } from '../src/sources/cache.ts';

const MINUTE = 60_000;

/** A clock the test moves by hand, so nothing sleeps and nothing goes flaky. */
function movableClock(): { now: () => number; advance: (ms: number) => void } {
  let current = 0;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('cacheKey', () => {
  it('gives one key to the three shapes an argument arrives in', () => {
    const array = cacheKey('confcal', 'search_events', { topics: ['ai', 'data'] });

    expect(cacheKey('confcal', 'search_events', { topics: '["ai","data"]' })).toBe(array);
    expect(cacheKey('confcal', 'search_events', { topics: 'ai, data' })).toBe(array);
  });

  it('gives one key to the same set in a different order', () => {
    expect(cacheKey('confcal', 'search_events', { topics: ['data', 'ai'] })).toBe(
      cacheKey('confcal', 'search_events', { topics: ['ai', 'data'] }),
    );
  });

  it('gives one key whatever order the argument names came in', () => {
    expect(cacheKey('tutu', 'search_hotels', { adults: 1, city_name: 'Казань' })).toBe(
      cacheKey('tutu', 'search_hotels', { city_name: 'Казань', adults: 1 }),
    );
  });

  it('gives different keys to different questions', () => {
    expect(cacheKey('confcal', 'search_events', { topics: ['ai'] })).not.toBe(
      cacheKey('confcal', 'search_events', { topics: ['ai', 'data'] }),
    );
  });

  it('gives different keys to different tools', () => {
    expect(cacheKey('tutu', 'search_hotels', {})).not.toBe(cacheKey('tutu', 'search_avia', {}));
  });

  it('gives different keys to different sources', () => {
    expect(cacheKey('tutu', 'search', {})).not.toBe(cacheKey('confcal', 'search', {}));
  });

  it('does not confuse an absent argument with an empty one', () => {
    expect(cacheKey('tutu', 'search_hotels', {})).not.toBe(
      cacheKey('tutu', 'search_hotels', { city_name: '' }),
    );
  });
});

describe('TtlCache', () => {
  it('answers from memory inside the time to live', async () => {
    const clock = movableClock();
    const cache = new TtlCache({ clock: clock.now });
    let calls = 0;

    await cache.through('k', 10 * MINUTE, async () => ++calls);
    clock.advance(9 * MINUTE);
    await cache.through('k', 10 * MINUTE, async () => ++calls);

    expect(calls).toBe(1);
  });

  it('asks again once the answer has gone stale', async () => {
    const clock = movableClock();
    const cache = new TtlCache({ clock: clock.now });
    let calls = 0;

    await cache.through('k', 10 * MINUTE, async () => ++calls);
    clock.advance(11 * MINUTE);
    await cache.through('k', 10 * MINUTE, async () => ++calls);

    expect(calls).toBe(2);
  });

  it('treats an answer that expires exactly now as stale', async () => {
    const clock = movableClock();
    const cache = new TtlCache({ clock: clock.now });
    let calls = 0;

    await cache.through('k', MINUTE, async () => ++calls);
    clock.advance(MINUTE);
    await cache.through('k', MINUTE, async () => ++calls);

    expect(calls).toBe(2);
  });

  it('does not remember a failure as though it were an answer', async () => {
    const cache = new TtlCache({ clock: () => 0 });
    let calls = 0;

    await expect(
      cache.through('k', MINUTE, async () => {
        calls += 1;
        throw new Error('the source did not answer');
      }),
    ).rejects.toThrow();

    await cache.through('k', MINUTE, async () => {
      calls += 1;
      return 'ответ';
    });

    expect(calls).toBe(2);
  });

  it('lets two callers asking at once share one call upstream', async () => {
    const cache = new TtlCache({ clock: () => 0 });
    let calls = 0;
    const slow = async (): Promise<number> => {
      calls += 1;
      await Promise.resolve();
      return calls;
    };

    const answers = await Promise.all([
      cache.through('k', MINUTE, slow),
      cache.through('k', MINUTE, slow),
      cache.through('k', MINUTE, slow),
    ]);

    expect(calls).toBe(1);
    expect(answers).toEqual([1, 1, 1]);
  });

  it('lets the next caller through after a shared call failed', async () => {
    const cache = new TtlCache({ clock: () => 0 });
    let calls = 0;
    const failing = async (): Promise<number> => {
      calls += 1;
      throw new Error('нет');
    };

    await Promise.allSettled([cache.through('k', MINUTE, failing), cache.through('k', MINUTE, failing)]);
    await expect(cache.through('k', MINUTE, failing)).rejects.toThrow();

    expect(calls).toBe(2);
  });

  it('keeps different questions apart', async () => {
    const cache = new TtlCache({ clock: () => 0 });

    await cache.through('a', MINUTE, async () => 'первый');
    const second = await cache.through('b', MINUTE, async () => 'второй');

    expect(second).toBe('второй');
  });

  it('does not grow without a ceiling', async () => {
    const cache = new TtlCache({ clock: () => 0, maxEntries: 3 });

    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      await cache.through(key, MINUTE, async () => key);
    }

    expect(cache.size).toBe(3);
  });

  it('drops the oldest entry when it runs out of room', async () => {
    const cache = new TtlCache({ clock: () => 0, maxEntries: 2 });

    for (const key of ['a', 'b', 'c']) {
      await cache.through(key, MINUTE, async () => key);
    }

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe('c');
  });

  it('stores nothing at all when the time to live is zero', async () => {
    const cache = new TtlCache({ clock: () => 0 });
    let calls = 0;

    await cache.through('k', 0, async () => ++calls);
    await cache.through('k', 0, async () => ++calls);

    expect(calls).toBe(2);
  });
});
