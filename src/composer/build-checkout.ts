/**
 * The checkout checklist: two or three links, each labelled by what it actually opens.
 *
 * Payment is not one button. The journey there, the room and the journey home are three
 * separate handovers to Tutu, and pretending otherwise would be the first thing a judge
 * discovers by clicking. Tutu builds the cart in the traveller's own browser session; nothing
 * here creates one, which is their legal model and not ours to work around.
 *
 * Links are built at click time and never stored. `checkout_ref` and `search_id` expire, and a
 * stored link is a cart button that silently becomes a search page a few hours later.
 *
 * Specified in `specs/04-kompozitor.md`, step 8.
 */
import { labelForCheckout, type CheckoutProduct } from './checkout-labels.ts';
import type { TripVariant } from './packages.ts';
import type { CheckoutLink, IsoDate } from './types.ts';
import type { TutuClient } from '../sources/tutu.ts';
import type { CheckoutAnswer } from '../sources/normalize.ts';

export type CheckoutOptions = {
  readonly tutu: TutuClient;
  readonly checkIn: IsoDate;
  readonly checkOut: IsoDate;
  readonly adults: number;
  /** In replay the links come from a recording and are labelled as such rather than as live. */
  readonly recorded?: boolean;
};

type RoomRate = { readonly offerpack_hash?: string };
type RoomDetails = { readonly rooms?: readonly { readonly rates?: readonly RoomRate[] }[] };

function toLink(
  part: CheckoutLink['part'],
  answer: CheckoutAnswer,
  product: CheckoutProduct,
  recorded: boolean,
): CheckoutLink | undefined {
  const url = answer.url ?? answer.fallbackUrl;
  if (url === undefined) return undefined;

  // When only the fallback survived, the link is a search page whatever the kind claimed.
  const kind = answer.url === undefined ? 'search_redirect' : answer.kind;
  const label = labelForCheckout(kind, product);

  return {
    part,
    url,
    ...(kind === undefined ? {} : { kind }),
    label: label.text,
    opensACart: label.opensACart,
    ...(label.caveat === undefined ? {} : { caveat: label.caveat }),
    ...(recorded ? { recorded: true } : {}),
  };
}

/**
 * The cart hash of a room, which is the only thing that mints a cart.
 *
 * The listing's `best_offer.offerpack_hash` does not: the redirector falls back to the hotel
 * page, and a button labelled "Открыть корзину" that lands on a page is the exact failure this
 * product exists to avoid. So the rate hash comes from `get_offer_details` or the link is
 * honestly called a page.
 */
async function roomRateHash(
  options: CheckoutOptions,
  hotelId: string,
): Promise<string | undefined> {
  try {
    const details = (await options.tutu.hotelDetails({
      hotelId,
      city: '',
      checkIn: options.checkIn,
      checkOut: options.checkOut,
      adults: options.adults,
    })) as RoomDetails;
    return details.rooms?.[0]?.rates?.[0]?.offerpack_hash;
  } catch {
    return undefined;
  }
}

async function link(
  options: CheckoutOptions,
  part: CheckoutLink['part'],
  product: CheckoutProduct,
  ref: Readonly<Record<string, unknown>> | undefined,
  fallbackUrl?: string,
): Promise<CheckoutLink | undefined> {
  if (ref === undefined) {
    return fallbackUrl === undefined
      ? undefined
      : toLink(part, { kind: 'search_redirect', url: fallbackUrl }, product, options.recorded === true);
  }

  try {
    return toLink(part, await options.tutu.createCheckoutLink(ref), product, options.recorded === true);
  } catch {
    // A failed live call is not an excuse for a dead button: the search page is offered, and
    // the label says that is what it is.
    return fallbackUrl === undefined
      ? undefined
      : toLink(part, { kind: 'search_redirect', url: fallbackUrl }, product, options.recorded === true);
  }
}

export async function buildCheckout(
  variant: TripVariant,
  options: CheckoutOptions,
): Promise<readonly CheckoutLink[]> {
  const hotel = variant.hotel?.hotel;
  let hotelRef: Readonly<Record<string, unknown>> | undefined;
  let hotelPage: string | undefined;

  if (hotel?.checkoutRef !== undefined) {
    const hash = await roomRateHash(options, hotel.id);
    hotelRef = { ...hotel.checkoutRef, ...(hash === undefined ? {} : { offer_pack_hash: hash }) };
    // Tutu's own pre-filled hotel page, so a failed link still hands the traveller somewhere.
    const fallback = hotel.checkoutRef['fallback_url'];
    hotelPage = typeof fallback === 'string' ? fallback : undefined;
  }

  const [there, room, home] = await Promise.all([
    link(
      options,
      'outbound',
      variant.outbound.mode,
      variant.outbound.checkoutRef,
      variant.outbound.searchResultsUrl,
    ),
    hotelRef === undefined
      ? Promise.resolve(undefined)
      : link(options, 'hotel', 'hotels', hotelRef, hotelPage),
    link(options, 'back', variant.back.mode, variant.back.checkoutRef, variant.back.searchResultsUrl),
  ]);

  // The order is the order the traveller does it in, not the order the calls happened to finish.
  return [there, room, home].filter((item): item is CheckoutLink => item !== undefined);
}
