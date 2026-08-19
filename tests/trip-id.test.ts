import { describe, expect, it } from 'vitest';
import { TripIdError, decodeTripId, encodeTripId } from '../src/composer/trip-id.ts';

const REQUEST = { topics: ['ai'], origin: 'Москва', adults: 1 };

describe('encodeTripId and decodeTripId', () => {
  it('round-trips a request', () => {
    const id = encodeTripId({ request: REQUEST });

    expect(decodeTripId(id).request).toEqual(REQUEST);
  });

  it('round-trips Cyrillic without losing it', () => {
    const id = encodeTripId({ request: { ...REQUEST, origin: 'Нижний Новгород' } });

    expect(decodeTripId(id).request.origin).toBe('Нижний Новгород');
  });

  it('round-trips every optional part of a request', () => {
    const full = {
      topics: ['ai', 'data'],
      origin: 'Москва',
      adults: 2,
      budget: 30000,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    };

    expect(decodeTripId(encodeTripId({ request: full })).request).toEqual(full);
  });

  it('remembers which event the link was made for', () => {
    expect(decodeTripId(encodeTripId({ request: REQUEST, eventId: 240 })).eventId).toBe(240);
  });

  it('gives one link to one request whatever order the topics were typed in', () => {
    expect(encodeTripId({ request: { ...REQUEST, topics: ['data', 'ai'] } })).toBe(
      encodeTripId({ request: { ...REQUEST, topics: ['ai', 'data'] } }),
    );
  });

  it('carries its format version, so a future format can be told apart', () => {
    expect(encodeTripId({ request: REQUEST }).startsWith('v1.')).toBe(true);
  });

  it('produces a link short enough to share', () => {
    expect(encodeTripId({ request: REQUEST }).length).toBeLessThan(200);
  });

  it('refuses a link from a version it does not know', () => {
    const id = encodeTripId({ request: REQUEST }).replace('v1.', 'v2.');

    expect(() => decodeTripId(id)).toThrow(TripIdError);
  });

  it('names the version it did not recognise', () => {
    const id = encodeTripId({ request: REQUEST }).replace('v1.', 'v2.');

    expect(() => decodeTripId(id)).toThrow(/v2/);
  });

  it('refuses a link with no version at all', () => {
    expect(() => decodeTripId('bm90aGluZw')).toThrow(TripIdError);
  });

  it('refuses a damaged link rather than half-reading it', () => {
    expect(() => decodeTripId('v1.тут-мусор')).toThrow(/повреждена|не описывает поездку/);
  });

  it('refuses a link that decodes to something that is not a trip', () => {
    const id = `v1.${Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8').toString('base64url')}`;

    expect(() => decodeTripId(id)).toThrow(/не описывает поездку/);
  });

  it('refuses a link longer than a link has any business being', () => {
    // It arrives in a URL from strangers; nobody gets to make the server parse a megabyte.
    expect(() => decodeTripId(`v1.${'A'.repeat(1000)}`)).toThrow(/длиннее/);
  });

  it('says why it refused, so the screen can explain rather than shrug', () => {
    try {
      decodeTripId(`v1.${'A'.repeat(1000)}`);
      expect.unreachable('an over-long link must be refused');
    } catch (error) {
      expect((error as TripIdError).reason).toBe('too-long');
    }
  });
});
