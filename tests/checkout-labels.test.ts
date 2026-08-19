import { describe, expect, it } from 'vitest';
import { labelForCheckout } from '../src/composer/checkout-labels.ts';

describe('labelForCheckout', () => {
  it('calls a cart a cart', () => {
    expect(labelForCheckout('checkout_deeplink')).toEqual({
      text: 'Открыть корзину',
      opensACart: true,
    });
  });

  it('calls a selection page a selection page', () => {
    expect(labelForCheckout('deeplink').text).toBe('Открыть страницу выбора');
  });

  it('says out loud when a link goes to search', () => {
    expect(labelForCheckout('search_redirect').text).toBe('Открыть поиск, корзины не будет');
  });

  it('names a hotel page as a hotel page', () => {
    expect(labelForCheckout('hotel_page').text).toBe('Открыть страницу отеля');
  });

  it('names an order as an order', () => {
    expect(labelForCheckout('order_url').text).toBe('Открыть заказ');
  });

  it('names a seat map as a seat map', () => {
    expect(labelForCheckout('seats_url').text).toBe('Выбрать места');
  });

  it.each(['deeplink', 'hotel_page', 'order_url', 'seats_url', 'search_redirect'])(
    'does not call a %s link a cart',
    (kind) => {
      expect(labelForCheckout(kind).opensACart).toBe(false);
    },
  );

  it('gives an unknown kind the most cautious wording there is', () => {
    const label = labelForCheckout('какой-то новый вид');

    expect(label).toMatchObject({ text: 'Открыть на Туту', opensACart: false });
  });

  it('says plainly that Tutu did not describe an unknown link', () => {
    expect(labelForCheckout('какой-то новый вид').caveat).toMatch(/не сказал/);
  });

  it('treats a missing kind exactly as it treats an unknown one', () => {
    expect(labelForCheckout(undefined)).toEqual(labelForCheckout('какой-то новый вид'));
  });

  it('never calls an unrecognised link a cart, whatever else it says', () => {
    expect(labelForCheckout('checkout_deeplink_v2').opensACart).toBe(false);
  });

  it('warns that an air deeplink lands on search in a cold browser', () => {
    expect(labelForCheckout('deeplink', 'avia').caveat).toMatch(/без активной сессии/);
  });

  it('adds no such warning to a rail link of the same kind', () => {
    expect(labelForCheckout('deeplink', 'railway').caveat).toBeUndefined();
  });

  it('does not warn about a cold browser on an air link that really is a cart', () => {
    expect(labelForCheckout('checkout_deeplink', 'avia').caveat).toBeUndefined();
  });

  it('answers identically every time it is asked', () => {
    expect(labelForCheckout('deeplink', 'avia')).toEqual(labelForCheckout('deeplink', 'avia'));
  });
});
