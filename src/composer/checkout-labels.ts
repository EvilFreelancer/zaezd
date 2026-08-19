/**
 * What the button says, derived from what Tutu actually returned.
 *
 * The judge opens the link in a private window. If a button labelled "Открыть корзину" lands on
 * a search page, everything else the product says about honesty stops counting, so the label is
 * never assigned in advance: it comes from the `kind` in the response and from nothing else.
 *
 * Pure lookup. Everything that talks to Tutu lives in `build-checkout.ts` at L3.
 * Specified in `specs/04-kompozitor.md`, step 8.
 */

export type CheckoutProduct = 'avia' | 'railway' | 'bus' | 'etrain' | 'hotels';

export type CheckoutLabel = {
  /** Product copy, in Russian, exactly as it ships on the button. */
  readonly text: string;
  /** True only for a link that mints a cart. Everything else is a page the traveller works from. */
  readonly opensACart: boolean;
  /** Shown next to the button when the link behaves differently than its name suggests. */
  readonly caveat?: string;
};

const LABELS: Readonly<Record<string, CheckoutLabel>> = {
  checkout_deeplink: { text: 'Открыть корзину', opensACart: true },
  deeplink: { text: 'Открыть страницу выбора', opensACart: false },
  hotel_page: { text: 'Открыть страницу отеля', opensACart: false },
  order_url: { text: 'Открыть заказ', opensACart: false },
  seats_url: { text: 'Выбрать места', opensACart: false },
  search_redirect: { text: 'Открыть поиск, корзины не будет', opensACart: false },
};

/**
 * The one Tutu behaviour a label cannot express on its own.
 *
 * An air deeplink mints a cart only in a browser that already has a live Tutu session. In a cold
 * private window - which is how this will be looked at - it lands on search. The demo therefore
 * leads with rail plus hotel and offers air as an alternative that says this out loud.
 */
const COLD_BROWSER_AIR =
  'В браузере без активной сессии Туту откроется поиск, а не выбор рейса';

/** Anything unrecognised gets the most cautious wording there is, never "Открыть корзину". */
const UNKNOWN: CheckoutLabel = {
  text: 'Открыть на Туту',
  opensACart: false,
  caveat: 'Туту не сказал, что именно откроется по этой ссылке',
};

export function labelForCheckout(
  kind: string | undefined,
  product?: CheckoutProduct,
): CheckoutLabel {
  const label = kind === undefined ? undefined : LABELS[kind];
  if (label === undefined) return UNKNOWN;

  // Only the deeplink behaves this way. An order page is an order page in any browser, and a
  // search redirect already says it is a search.
  if (product === 'avia' && kind === 'deeplink') {
    return { ...label, caveat: COLD_BROWSER_AIR };
  }
  return label;
}
