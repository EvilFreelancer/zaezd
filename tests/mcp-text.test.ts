import { describe, expect, it } from 'vitest';
import { textFor } from '../src/mcp/shape.ts';

/** The smallest answer `textFor` will read: one event, one package, no optional blocks. */
function answer(event: Record<string, unknown>): Record<string, unknown> {
  return {
    trip_id: 'v1.test',
    event,
    stay: { check_in: '2026-08-20', check_out: '2026-08-21', nights: 1 },
    packages: [
      {
        rules: ['cheapest'],
        total: { amount: 100, currency: 'RUB' },
        is_lower_bound: false,
        complete: true,
        missing: [],
        event_price_excluded: false,
        outbound: {
          mode: 'railway',
          departure_at: '2026-08-20T06:00:00+03:00',
          arrival_at: '2026-08-20T14:00:00+03:00',
          price: { amount: 50, currency: 'RUB' },
        },
        back: {
          mode: 'railway',
          departure_at: '2026-08-21T06:00:00+03:00',
          arrival_at: '2026-08-21T14:00:00+03:00',
          price: { amount: 50, currency: 'RUB' },
        },
      },
    ],
    coverage: 'Каталог знает 1 город.',
    notes: [],
    alternatives: [],
    computed_at: '2026-08-19T12:00:00Z',
    mode: 'replay',
  };
}

describe('what the text channel says about a venue', () => {
  it('asks for the address when the catalogue named a place but no address', () => {
    const text = textFor(
      answer({ title: 'Событие', city: 'Казань', venue: 'ИТ-парк', venue_precision: 'approximate' }),
    );

    expect(text).toContain('найдите адрес');
    expect(text).toContain('ИТ-парк');
    expect(text).toContain('не из каталога');
  });

  it('asks for the address when the catalogue named nothing at all', () => {
    const text = textFor(answer({ title: 'Событие', city: 'Казань', venue_precision: 'city' }));

    expect(text).toContain('Площадку каталог не назвал');
    expect(text).toContain('найдите адрес');
  });

  it('asks for nothing when the address is already exact', () => {
    const text = textFor(
      answer({ title: 'Событие', city: 'Казань', venue: 'ул. Спартаковская, 6', venue_precision: 'exact' }),
    );

    expect(text).not.toContain('найдите адрес');
  });
});
