import { describe, expect, it } from 'vitest';
import { coverageSentence, plural } from '../src/web/client/copy.ts';

describe('plural', () => {
  it.each([
    [1, 'город'],
    [2, 'города'],
    [4, 'города'],
    [5, 'городов'],
    [11, 'городов'],
    [12, 'городов'],
    [14, 'городов'],
    [21, 'город'],
    [22, 'города'],
    [25, 'городов'],
    [101, 'город'],
    [111, 'городов'],
    [0, 'городов'],
  ])('writes %i as "%s"', (count, expected) => {
    expect(plural(count, 'город', 'города', 'городов')).toBe(expected);
  });
});

describe('coverageSentence', () => {
  it('agrees with the numbers it carries', () => {
    const sentence = coverageSentence({
      citiesListed: 21,
      citiesWithEvents: 15,
      onlineEvents: 40,
      countsCoverWholeDirectory: true,
    });

    expect(sentence).toBe(
      'Каталог знает 21 город, живые офлайн-события есть в 15. Ещё 40 событий проходят онлайн.',
    );
  });

  it('says the counts came from one page rather than passing them off as the whole catalogue', () => {
    const sentence = coverageSentence({
      citiesListed: 2,
      citiesWithEvents: 1,
      onlineEvents: 3,
      countsCoverWholeDirectory: false,
    });

    expect(sentence).toBe('Каталог знает 2 города. Счётчики показаны по одной странице справочника.');
  });

  it('does not claim a city count it never got', () => {
    const sentence = coverageSentence({
      citiesListed: 1,
      onlineEvents: 1,
      countsCoverWholeDirectory: true,
    });

    expect(sentence).toBe('Каталог знает 1 город. Счётчики показаны по одной странице справочника.');
  });
});
