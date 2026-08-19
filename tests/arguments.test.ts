import { describe, expect, it } from 'vitest';
import { canonicalList, toArguments, toList, toNumber, toText } from '../src/sources/arguments.ts';

describe('toList, the three shapes an argument actually arrives in', () => {
  it('takes a real array', () => {
    expect(toList(['ai', 'data'])).toEqual(['ai', 'data']);
  });

  it('takes the same array as a JSON string, which is what agents send', () => {
    // Measured: in three live runs of one request, every array argument arrived like this.
    expect(toList('["ai","data"]')).toEqual(['ai', 'data']);
  });

  it('takes a comma-separated string', () => {
    expect(toList('ai, data')).toEqual(['ai', 'data']);
  });

  it('reads all three shapes of the same request the same way', () => {
    const array = toList(['ai', 'data']);

    expect(toList('["ai","data"]')).toEqual(array);
    expect(toList('ai, data')).toEqual(array);
  });

  it('takes a single value with no list around it', () => {
    expect(toList('ai')).toEqual(['ai']);
  });

  it('treats nothing at all as an empty list', () => {
    expect(toList(undefined)).toEqual([]);
    expect(toList(null)).toEqual([]);
    expect(toList('')).toEqual([]);
  });

  it('drops the empty items a trailing comma leaves behind', () => {
    expect(toList('ai, , data,')).toEqual(['ai', 'data']);
  });

  it('strips the quotes left by a half-serialised list', () => {
    expect(toList('"ai", "data"')).toEqual(['ai', 'data']);
  });

  it('falls back to reading a broken JSON list as a plain one', () => {
    expect(toList('[ai, data')).toEqual(['ai', 'data']);
  });

  it('flattens a list that arrived one level too deep', () => {
    expect(toList([['ai'], 'data'])).toEqual(['ai', 'data']);
  });

  it('reads a number as the string an agent meant by it', () => {
    expect(toList(2026)).toEqual(['2026']);
  });
});

describe('canonicalList', () => {
  it('gives the same answer for the same set in a different order', () => {
    expect(canonicalList(['data', 'ai'])).toEqual(canonicalList(['ai', 'data']));
  });

  it('gives the same answer for all three argument shapes', () => {
    expect(canonicalList('["data","ai"]')).toEqual(canonicalList(['ai', 'data']));
    expect(canonicalList('data, ai')).toEqual(canonicalList(['ai', 'data']));
  });

  it('does not confuse two different sets', () => {
    // The old rule called ["ai"] and "ai, data" equivalent. They are not the same question.
    expect(canonicalList(['ai'])).not.toEqual(canonicalList('ai, data'));
  });

  it('folds case, because a topic slug is a slug however it was typed', () => {
    expect(canonicalList(['AI'])).toEqual(['ai']);
  });

  it('removes a value repeated twice', () => {
    expect(canonicalList(['ai', 'ai', 'data'])).toEqual(['ai', 'data']);
  });
});

describe('toNumber', () => {
  it('takes a number', () => {
    expect(toNumber(30000)).toBe(30000);
  });

  it('takes a number that arrived as a string', () => {
    expect(toNumber('30000')).toBe(30000);
  });

  it('takes a number written with spaces, the way a person types a budget', () => {
    expect(toNumber('30 000')).toBe(30000);
  });

  it('takes a decimal written with a comma', () => {
    expect(toNumber('2090,93')).toBe(2090.93);
  });

  it('refuses a string that is not a number rather than answering zero', () => {
    expect(toNumber('тридцать тысяч')).toBeUndefined();
  });

  it('refuses infinity and not-a-number', () => {
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(toNumber(Number.NaN)).toBeUndefined();
  });

  it('treats nothing at all as nothing', () => {
    expect(toNumber(undefined)).toBeUndefined();
    expect(toNumber('')).toBeUndefined();
  });
});

describe('toText', () => {
  it('trims a string', () => {
    expect(toText('  Москва ')).toBe('Москва');
  });

  it('treats an empty string as nothing given', () => {
    expect(toText('   ')).toBeUndefined();
  });

  it('takes a number as the text an agent meant by it', () => {
    expect(toText(2026)).toBe('2026');
  });
});

describe('toArguments', () => {
  it('takes an object', () => {
    expect(toArguments({ origin: 'Москва' })).toEqual({ origin: 'Москва' });
  });

  it('takes a call with no arguments at all', () => {
    expect(toArguments(undefined)).toEqual({});
    expect(toArguments(null)).toEqual({});
  });

  it('takes an argument object that arrived as a JSON string', () => {
    expect(toArguments('{"origin":"Москва"}')).toEqual({ origin: 'Москва' });
  });

  it('refuses to read an array as an argument object', () => {
    expect(toArguments(['origin'])).toEqual({});
  });

  it('refuses to read broken JSON as an argument object', () => {
    expect(toArguments('{origin')).toEqual({});
  });
});
