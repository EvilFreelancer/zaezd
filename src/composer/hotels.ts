/**
 * Which hotels are worth showing, and whether a distance may be claimed at all.
 *
 * Tutu cannot search hotels by coordinates, only by city, but it returns the coordinates of
 * every hotel it lists. That is what lets the product answer the question a traveller actually
 * asks about a conference hotel - how far is it from the venue - without a single extra call.
 *
 * The rule that matters is the negative one. A distance is shown only when the venue itself was
 * geocoded precisely. A city centre is not a venue, and "800 m from the centre" dressed up as
 * "800 m from the conference" is the same class of lie as an invented field.
 *
 * Specified in `specs/04-kompozitor.md`, step 5.
 */
import type { HotelOffer, Money, VenueLocation } from './types.ts';

const HOTELS_SHOWN = 3;
const EARTH_RADIUS_M = 6_371_000;

export type RankedHotel = {
  readonly hotel: HotelOffer;
  /** Straight-line metres to the venue. Absent unless both points are genuinely known. */
  readonly distanceM?: number;
};

export type HotelRanking = {
  readonly hotels: readonly RankedHotel[];
  readonly rankedBy: 'distance' | 'price-and-rating';
  /** True when a ceiling was set and nothing on offer met it, so the list ignores it. */
  readonly priceCeilingUnmet: boolean;
};

export type HotelRankingInput = {
  readonly hotels: readonly HotelOffer[];
  readonly venue: VenueLocation;
  /** The traveller's ceiling for the whole stay. There is no hidden "reasonable" band. */
  readonly maxStayPrice?: number;
  readonly limit?: number;
};

/** Great-circle distance in metres. Good to a few metres at city scale, which is the scale here. */
export function distanceBetween(
  from: { readonly lat: number; readonly lng: number },
  to: { readonly lat: number; readonly lng: number },
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))));
}

function price(hotel: HotelOffer): number {
  return hotel.price.amount;
}

/** Higher is better, and a hotel with no rating is not treated as a hotel with a bad one. */
function rating(hotel: HotelOffer): number {
  return hotel.rating ?? -1;
}

export function rankHotels(input: HotelRankingInput): HotelRanking {
  const limit = input.limit ?? HOTELS_SHOWN;
  const venue = input.venue.precision === 'exact' ? input.venue : undefined;

  const measured: RankedHotel[] = input.hotels.map((hotel) => {
    if (venue === undefined || hotel.location === undefined) return { hotel };
    return { hotel, distanceM: distanceBetween(hotel.location, venue) };
  });

  // A ceiling nobody meets is not a reason to show an empty screen; it is a reason to say so.
  const withinCeiling =
    input.maxStayPrice === undefined
      ? measured
      : measured.filter((entry) => price(entry.hotel) <= (input.maxStayPrice as number));
  const priceCeilingUnmet = input.maxStayPrice !== undefined && withinCeiling.length === 0;
  const pool = priceCeilingUnmet ? measured : withinCeiling;

  const byDistance = (left: RankedHotel, right: RankedHotel): number => {
    // A hotel with no coordinates is not near, it is unknown, so it sorts after every hotel
    // that could actually be measured rather than ahead of them at distance zero.
    if (left.distanceM === undefined && right.distanceM === undefined) return byPriceAndRating(left, right);
    if (left.distanceM === undefined) return 1;
    if (right.distanceM === undefined) return -1;
    return left.distanceM - right.distanceM || byPriceAndRating(left, right);
  };

  const byPriceAndRating = (left: RankedHotel, right: RankedHotel): number =>
    price(left.hotel) - price(right.hotel) ||
    rating(right.hotel) - rating(left.hotel) ||
    left.hotel.id.localeCompare(right.hotel.id);

  const ranked = [...pool].sort(venue === undefined ? byPriceAndRating : byDistance);

  return {
    hotels: ranked.slice(0, limit),
    rankedBy: venue === undefined ? 'price-and-rating' : 'distance',
    priceCeilingUnmet,
  };
}

/** The whole-stay price of a ranked hotel, for the caller that has to add it up. */
export function stayPrice(entry: RankedHotel): Money {
  return entry.hotel.price;
}
