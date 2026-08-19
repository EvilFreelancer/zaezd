/**
 * What travels between the server and the board, by name.
 *
 * The board is drawn by one renderer in two channels, and in the App channel the data arrives
 * as metadata on a tool result. Both sides read these keys from here, so a rename cannot leave
 * one channel silently blank.
 */
export const TRIP_META_KEY = 'zaezd/trip';

export const CHECKOUT_META_KEY = 'zaezd/checkout';
