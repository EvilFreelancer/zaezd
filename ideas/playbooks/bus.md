# Bus playbook (`search_bus` -> `get_offer_details` ->
`create_checkout_link`)

## Passengers
Search with the real party: `adults` + `children` (a child occupies a seat
and is priced on the carrier's child fare — the age limit and any discount
are carrier-specific, so never promise a discount the price doesn't show).
Offer prices cover the WHOLE searched party, and `checkout_ref` carries the
composition (`passengers` total + `passengers_adult` / `passengers_child`).
Registration checks it: give each passenger the matching `voyager_type`
(ADULT / CHILD) — a mismatch is refused before anything is booked. The
`explicit/bus` deeplink carries seats, not composition — on that path the
user confirms adults/children in the cart themselves.

## Detail card
`get_offer_details(product_type='bus', details_ref=<offer.details_ref>)`
loads stops, carrier, structured `amenities[]` (machine-readable codes:
wifi / air_conditioning / power_outlet / toilet — localize via
`tutu://amenities/dictionary`), a `ticket` block (eticket flag + accepted
documents), `refund.blocks[]` / `luggage.blocks[]`, `seat_selection`
(free_count, available_seat_ids, has_scheme) and `bus_category`. Use
`available_seat_ids` as `seat_numbers` for straight-to-cart only after the
user asked you to choose/preselect seats. If `available_seat_ids` is empty
but `free_count` is positive, do NOT say there are no seats; say exact-seat
preselection is not available in this API response and give the seat-page
link instead. The field list is in the tool's description.

## Stops presentation
Show stop names/addresses from `legs`, `checkout_ref.*_stop_name`, or
`get_offer_details`. NEVER show raw stop ids as the only stop description.

## Checkout
`create_checkout_link` (transport=bus) builds an `explicit/bus` deeplink.
TWO modes:

1. **Seat page (default, `kind="deeplink"`)** — from `offer_hash` +
   `departure_geo_city_id` / `arrival_geo_city_id` + `departure_at`;
   opens THIS bus's seat-selection page in the user's session.
2. **Straight-to-cart (`kind="checkout_deeplink"`)** — ONLY after the user
   explicitly confirmed seats: additionally pass `seat_numbers` (ids from
   `get_offer_details`'s `seat_selection.available_seat_ids`, one per
   passenger) + `search_id` + `departure_id`/`arrival_id` from
   `checkout_ref` (all three required — the redirector rejects the cart
   mode without them). Mints the cart with those seats pre-selected;
   works in a cold browser, the cart belongs to whoever opens the link.
   The user enters passenger details in the cart.

If the city ids are missing it falls back to the bus.tutu.ru/seats page
(`kind="seats_url"` + a `note`). `departure_id` / `arrival_id` are the
route ids; stop ids/names are display-only. The field list is in the
tool's description.

NB two id spaces sit next to each other here: `checkout_ref` carries BOTH
`departure_id` (route id, e.g. Москва=1447874 — what the link uses) and
`departure_geo_city_id` (dictionary city id, e.g. 2657260 — the same
value as `meta.from.geo_id`). They are NOT interchangeable, the tool
already picks the right one, and rewriting the returned `checkout_url`
with the other set sends the user to a search page instead of the
chosen bus.

## Cashback
`meta.cashback` states Tutu's loyalty accrual ONCE for the whole page.
Tutu bonus points credited to the buyer's Tutu account after payment; they
do NOT reduce `price`, so never present them as a discount or subtract
them from the fare. No `meta.cashback` means nothing here earns any.

`applies_to: all_fares` means every fare row earns the same rate — it
cannot separate one bus from another, so don't rank on it and mention it
at most once as a footnote. `most_fares` / `some_fares` mean the rate is
NOT uniform and can genuinely favour one fare: `rows_at_rate` of
`rows_total` says how far from universal it is, and `exceptions[]` names
what differs — an `offer_id`, its `price`, and `variant_id` when a campaign
prices one fare family only (`exceptions_total` when the list was capped).
Quote the row by its `price`. Fare rows no longer carry their own cashback,
so that list is the only place the difference shows.

## Grounding
Stop names, luggage rules and carrier facts come from the response or
`get_offer_details` — never invent luggage/boarding rules when the field
is missing.
