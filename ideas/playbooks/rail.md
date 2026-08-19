# Rail playbook (`search_rail` -> `get_offer_details` / `get_rail_seatmap`
-> `create_checkout_link`)

## Station disambiguation (mandatory)
Big cities have several вокзалы far apart (Москва: Ленинградский /
Казанский / Курский …). The departure / arrival point is in
`legs[].segments[].from|to` as a self-describing string `"City — Station
(code)"` (e.g. `"Москва — Ленинградский вокзал (2006004)"`). Name the
concrete station when comparing offers — don't present trains leaving the
same city from different вокзалы as a shared origin, and don't make the
user infer the station from the URL.

## Train type / brand
When the user names a train type or brand («Ласточка», «Сапсан»,
«фирменный», «двухэтажный»), match it from the offer's
`legs[].segments[].vehicle_meta`: `name` is the brand (may be absent),
with `is_premium` / `is_double_decker` set when true — an unbranded
двухэтажный still carries `is_double_decker` even with no `name`. The
field is omitted only for a plain РЖД train (no brand, no flags); when
it's missing say «не фирменный / не двухэтажный» rather than guessing.
The brand/flags are also how you distinguish two trains when the user
cares about speed/comfort, not just price.

The default `sort=price_asc` returns the cheapest offer first, which is
often a slow long-distance train, NOT the fast Ласточка/Сапсан the user
may have in mind. Don't present offer[0] as «the train» when the request
was for a specific type or the soonest/fastest departure — filter by
`vehicle_meta`, or re-run with `sort='departure_asc'` / `'duration_asc'`,
so the train you show matches what they asked for.

## Exact train — «возьми поезд N»
A results page is a WINDOW over the matched trains (up to `page_size`,
default 10, cheapest-first), NOT the day's schedule: `meta.total_matched`
says how many trains matched in total and `meta.has_more` — whether pages
remain. A train absent from the current page may still run that day, so
NEVER conclude «поезда N нет» from one page while `has_more` is true —
that exact mistake told a user their real train did not exist.
When the user names a train, pass `train_numbers=['750У']` — it filters
the FULL day (matches display numbers like «136*С», Latin lookalikes,
leading zeros; `meta.post_filter_dropped_wrong_train_number` counts the
rest). Mind what an empty filtered result proves. In a NUMBER-ONLY
search it means «билетов на этот поезд в продаже нет» — and no more:
the search lists BOOKABLE trains only (sold-out and notify-only trains
are excluded upstream), so the train may still run that day. Say «нет
в продаже на эту дату», never a timetable claim («не ходит / не
существует»). With other filters also active (`price_max` /
`seat_categories` / `carriers` / `direct_only`) even that doesn't
follow — the named train may be dropped by one of those (each counts
its removals in `meta.post_filter_dropped_*`); re-run number-only
before concluding. And the conclusion covers DIRECT trains only: on a
route sold via transfers the `meta.interchange_routes` block is
nondeterministic upstream (the same request may come back without
plans), so an absent or emptied transfer block is INCONCLUSIVE — say
«прямых поездов с этим номером в продаже нет» and don't rule out the
train as a leg of a transfer.
If the named train is absent from sale, say exactly that.
Do not silently substitute another train. Use a replacement only when
the user explicitly allowed a fallback; then follow their stated selection
rule, announce the substitution, and avoid cycling through arbitrary trains.

## Fares & classes (compact-first)
In the default `compact` view a rail offer carries a `fares` summary
`{count, price_from, price_to, currency, refundable_count?,
changeable_count?, refundable_unknown?, changeable_unknown?,
seat_categories?, uncategorized_fares?}`, NOT the
full per-class `variants[]`. The counts say how many fare rows are KNOWN refundable /
exchangeable — a row whose conditions upstream left unresolved counts as
neither, so `refundable_count: 0` means «подтверждённо возвратных нет»,
not «возвратных не бывает».
- `refundable_unknown` / `changeable_unknown` say how many rows upstream
  left unresolved on that field — the same signal `uncategorized_fares`
  gives for car category, and read the same way: while the counter is
  there, «возвратных нет» is a guess, so report N тарифов with unknown
  conditions and offer `view='full'` / `get_offer_details` instead of
  denying. Absent when every row resolved the field (the normal case).
- The two fields resolve independently, so one can be counted while the
  other is unknown — never carry a conclusion from one to the other.
- A count is ABSENT (not zero) when no row resolved that field at all.
  An absent count is not «нет возвратных»; it is «неизвестно».
- `uncategorized_fares` always bounds the CATEGORY ladder. It bounds
  these counts too ONLY when you passed `seat_categories`: that filter
  deletes those rows before the summary is built, so the counts then
  cover a partial fare set and `view='full'` cannot bring them back —
  re-run without the filter. Unfiltered, the rows stay in the summary and
  the counts are complete. Never add the three counters together.
For WHICH price is the refundable one, re-run `search_rail`
with `view='full'` — each variant then carries `conditions: {refundable,
changeable}` (omitted when upstream segments disagree — don't guess
then). The variant rows hold no human class NAME (купе / плацкарт / СВ
descriptions live in `get_offer_details`), so to name a class or its
amenities call `get_offer_details` on the chosen offer — its
`variants[].fare_type` (REFUNDABLE / NON_REFUNDABLE) covers
refundability there; exchange rules (`changeable`) exist ONLY at search
level. Don't claim a class/price/condition the current view doesn't
contain.

## Car category — «сидячий / плацкарт / купе / СВ» (from search)
`fares.seat_categories` maps every car category the train sells to
`{count, price_from}`; in `view='full'` each variant carries
`seat_category` plus `service_class` (Express-3 code: `2С`, `3Э`, `1В`…)
and `seats_left`. Categories are the upstream enum — `SEDENTARY`
(сидячий), `RESERVED_SEAT` (плацкарт), `COMPARTMENT` (купе), `LUX` (СВ),
`SOFT` (мягкий), `SHARED` (общий).
- «Нужна сидячка / дешёвая сидячка» = `seat_categories.SEDENTARY`
  (`price_from` is its cheapest fare), or re-run with
  `seat_categories=['SEDENTARY']` to drop the other trains server-side.
  Do NOT load `get_offer_details` / `get_rail_seatmap` per train to
  learn this, and do NOT infer «сидячий» from the class code — the
  category field is the answer.
- The `seat_categories` PARAMETER narrows what you get back: a filtered
  offer's `price` / `fares` / sort order describe the requested
  categories only. That's what makes «самый дешёвый сидячий» correct,
  but it also means a filtered result never proves the train lacks
  other cars — for the whole ladder re-run without the filter. And
  before reporting an EMPTY (or thin) filtered page as «таких поездов
  нет», check `meta.post_filter_unverified_seat_category`: that many
  trains hold a fare nobody could classify, so the category may be there
  at a price you never compared — say the check was inconclusive and
  re-run without the filter instead of denying.
- Сидячка is a CAR category, not a brand: Сапсан/Ласточка are
  sedentary-only, but plenty of ordinary trains (Аврора, двухэтажные,
  ФПК) sell a сидячий car next to купе. Read the field, don't guess
  from the train name.
- A category missing from `seat_categories` means no fare of that kind
  is on sale for this train/date — say that, don't promise «обычно
  бывает». ONE exception: if `fares.uncategorized_fares` is present,
  that many fare rows couldn't be classified (upstream sent an
  incomplete conditions row, or a multi-segment fare whose legs
  disagree). Then «нет сидячих» is a guess — say the classification is
  incomplete for N тарифов and offer `get_offer_details` for that train.
  In `view='full'` the same count rides at OFFER level as
  `uncategorized_fares` (there is no `fares` block there) — read it the
  same way.
- `seats_left` is per FARE ROW: a party of N needs a row with
  `seats_left >= N`. Never sum rows — tariffs of one class share the
  same physical seats, so the sum overstates availability.

## Detail card
`get_offer_details(product_type='rail', details_ref=<offer.details_ref>)`
loads `service_classes[]` — one card per class with the human class code
(купе/плацкарт/СВ), description, `amenities[]` (codes + Russian labels —
localize via `tutu://amenities/dictionary`), the per-class rating and
photos — plus lean fare rows in `variants[]` (price + `fare_type`
REFUNDABLE/NON_REFUNDABLE + car/seat counts; join a row to its class
card via `class_index` — an index into `service_classes[]`; the display
name is duplicated as `service_class`), `cars[]`, a `train_vehicle`
block and a `ticket` block. For a fare ladder, walk `variants[]`
(cheapest-first) and label each row from its class card. The field list is in that
tool's description.

**Free seats.** For the train's total free seats sum `cars[].seats_count`
(per-car availability, counted once). Do NOT sum `variants[].seats_count`:
variants are fare rows and several can map to the same seat group, so
summing them double-counts the same inventory across tariffs. For per-car
or per-class availability read `cars[].seats_count` directly.

## Seat map: `get_rail_seatmap`
Call with the same `details_ref` from `search_rail` to help the user choose a
seat by the wagon's layout (read-only). Choosing is YOUR work: read the map,
propose the seats that fit what they asked for, and let them confirm — don't
hand over the raw layout and ask them to find one.
- `seatmap_status`: `"ok"` = Tutu returned a schema;
  `"no_layout_for_carrier"` (carries `agent_hint`) = NO SCHEMA, **not**
  "no seats". It is RARE — every train sampled live came back with a
  layout, commercial brands and double-deckers included — so assume a
  layout exists and read the field instead of predicting its absence.
  It decides whether seats can be picked HERE — **not which checkout the
  user gets**. Every hand-off stays open either way:
  `"ok"` → HELP the user choose a car + seats (propose what fits their
  ask, they confirm — a reservation holds real inventory, so never pick
  silently). Then hand the choice to `create_checkout_link` (same `car_number` + `seat_numbers`) — it mints the cart straight from the link, with the seats pre-selected.
  `"no_layout_for_carrier"` → nothing to pick from here, so the seats are
  chosen on Tutu instead: `create_checkout_link` gives the seat page
  (a `checkout_url`). A correct
  outcome, not a failure — never present it as a Tutu defect, and never
  suggest a seatless cart: a rail cart is minted by RESERVING seats with
  the carrier, so one without them does not exist anywhere. If the train
  IS in `search_rail` output, assume a layout exists until this field says
  otherwise — don't infer «схемы нет» from a rejected registration call.
- Seat `type` is an OPEN vocabulary. LOWER / UPPER / SIDE_LOWER /
  SIDE_UPPER / SEDENTARY are the common values, but live payloads also
  carry variants — `LOWER_NEAR_WC`, `UPPER_NEAR_WC`,
  `SEDENTARY_WITH_PETS`. Match by PREFIX, and mind that the two axes
  are independent: a LOWER berth is any type starting `LOWER` **or**
  `SIDE_LOWER`, while `SIDE_*` marks the side of the car. So «нижнее
  место» = `LOWER*` ∪ `SIDE_LOWER*`; `type == "LOWER"` silently drops
  both `LOWER_NEAR_WC` and every боковое нижнее. Join
  fare/class via `seat.group_index` into `cars[].seat_groups[]` — NEVER via
  `seat.type` (two groups in one car can share a type at different service
  classes). Use the precomputed `distance_to_nearest_wc_px` instead of
  doing geometry.
- `cars[].car_type` is the same car-category enum `search_rail` reports
  (SEDENTARY / RESERVED_SEAT / COMPARTMENT / LUX / SOFT / SHARED) —
  there is no `SEATED` / `SITTING` value; сидячий IS `SEDENTARY`. It is
  a PHYSICAL car type, distinct from `cars[].service_class` (the tariff
  code `2С` / `2Э` / `2Т`). Don't come here just to test for сидячка —
  `search_rail`'s `fares.seat_categories` already answers that.
- Fares per group: `seat_groups[].fares[]` lists every fare type of the
  group cheapest-first — one `{fare_type, price, child_price?}` entry per
  type (REFUNDABLE vs NON_REFUNDABLE; missing type → `"UNKNOWN"`).
  `price` is the ADULT fare, `child_price` the CHILD fare of the same
  type when the group is priced for a child. Compare refundable vs
  non-refundable and adult vs child from here; do NOT send the
  user to checkout just to learn a price. `cheapest_fare` is `fares[0]`.
  **Pricing caveat** (`pricing_note` in the response): seatmap prices are
  pre-cart totals and run BELOW the final cart price — checkout
  applies Tutu's own, larger service fee (observed +6–8%), while the
  `search_rail` LISTING price matches the cart to the kopek. So: compare
  fare types / seats by seatmap numbers, but quote the bookable total
  from the search listing (or say the exact final price shows in the
  cart) — never present a seatmap price as the amount to be paid.
  A rare `discounted: true` flags a type where upstream returned only
  discounted prices — say so instead of presenting it as the standard
  fare.
- Children & composition: top-level `passenger_requirements` carries the
  age rules (typically CHILD ≤10 — paid child ticket; BABY ≤5 —
  `needs_ticket=true, chargeable=false`, i.e. an infant rides free but
  STILL needs a ticket in the order). Caveat any `child_price` with the
  age rule and note the exact discount is confirmed on checkout.
  The
  rail deeplink can prefill SEATS (and fare/gender — see Checkout) but
  not the passenger composition — the user enters adults/children
  themselves on the opened Tutu page or in the cart (unlike avia, where
  the deeplink forwards the composition).
- Pagination: defaults `max_cars=5` × `max_seats_per_car=40` (keeps a
  ~9-car train under the 64 KB cap). Cars over the cap stay in `cars[]` as
  skeletons (`seats=[]`, `seats_omitted_for_pagination=true`) so you see
  the full train shape. To load one car fully, call again with
  `car_number=<id>` — do NOT bump `max_cars` on the first call to "see
  everything".
- Focused questions: prefer `task=` over paging the whole map. `task=
  'far_from_wc'` returns the farthest seats by `distance_to_nearest_wc_px`
  ranked **per berth type** in `seats_by_type` (so the best LOWER isn't
  hidden behind UPPER berths). Its keys are the RAW upstream types, so
  «нижнее подальше от туалета» means EVERY key starting `LOWER` OR
  `SIDE_LOWER` (`LOWER`, `LOWER_NEAR_WC`, `SIDE_LOWER`, …) — `SIDE_LOWER`
  does NOT start with `LOWER`, so a bare `LOWER*` scan drops боковые
  нижние, and the two plain names alone drop the `_NEAR_WC` variants.
  `task='female'`
  returns seats currently
  `gender="FEMALE"`, capped with a `total_female_seats` count + the
  dynamic-policy caveat; `task='summary'` returns per-car available-seat
  counts by berth type. Each is a short ranked answer (best seats + why),
  not hundreds of seats. Tasks run over the whole train by default; pass
  `car_number` to scope a task to one car (e.g. to narrow a long `female`
  list). Task responses keep `seatmap_status` (`ok` / `no_layout_for_carrier`).
- **«Места рядом» → `task='together'`** (+ `seats_together`, default 2).
  Never page the map and work out adjacency from `compartment_number` or
  coordinates yourself — that is what this task is for. It returns
  `groups_by_car_type`: per car category, the cheapest candidate groups of
  N free seats that share ONE section, each with `car_number`,
  `compartment_number`, `seat_numbers` (ready for the checkout hand-off),
  the section's `gender`, `spread_px` (widest gap inside the group) and
  `total_price` + `total_fare_type` — the cheapest total priced in ONE
  fare type all the seats share, because checkout takes a single
  `fare_type` for the whole selection. Quote that type with the price;
  when the seats share no type there is no total at all. What a
  "section" means differs by car and the response
  spells it out per category: купе / СВ / мягкий = one compartment;
  плацкарт = one section with compartment berths and боковушки kept
  APART (`side`: `MAIN` / `SIDE`) even though upstream numbers them
  together; сидячий = one seat block as Tutu marks it up. On a
  double-decker a group never spans two decks (`deck` is reported).
  **Sitting «в одном блоке» is not the same as «бок о бок»** — the
  layout does not mark the aisle, so state what the data says and quote
  `spread_px`, don't promise there is no aisle between them. When nothing
  fits, `groups_by_car_type` is `{}` and you get
  `largest_group_available` + `best_available_groups_by_car_type`: say
  honestly that N together isn't available, offer the smaller group or
  separate seats — never dress scattered seats up as «рядом».
- Detail level: the default `view='compact'` omits the raw per-seat
  geometry (`position` / `size` / `nearest_wc_rect`) — you decide on the
  precomputed `distance_to_nearest_wc_px` + seat attributes, not on pixel
  coordinates. Pass `view='full'` only if a client actually draws the car.
- Grounding: window/aisle flags are NOT provided and CANNOT be derived —
  the scheme marks neither windows nor the aisle (in сидячий the grid
  step is the same between neighbours and across the aisle). What car
  construction does guarantee: in lying-berth cars (плацкарт / купе /
  СВ / мягкий) every section has its own window, so «у окна» does not
  select a berth — steer the user to нижнее/верхнее and (in плацкарт)
  MAIN vs SIDE_* instead of asking about the window. In сидячий
  window-vs-aisle is simply unknown from the data — say so honestly,
  never infer it from coordinates. Amenities
  are per-wagon, not per-seat; sold/held seats are omitted by upstream.

## Gender coupes (dynamic)
Read `seat_groups[].is_gender` and `seats[].gender` from the CURRENT
response. Treat only `gender="FEMALE"` as a female seat and only
`gender="MALE"` as male; `MIXED`, `NO_GENDER` and `UNDEFINED` prove
nothing. The policy changes as seats sell — never hardcode a compartment
number as gendered. Remind the user the final gender choice is confirmed
on Tutu checkout.

## No direct train: transfer routes (`meta.interchange_routes`)
When no train runs the whole route on that date, `offers` comes back EMPTY
and `meta.interchange_routes` holds two-train plans instead (cheapest first,
`meta.interchange_routes_total` says how many exist). Never answer «поездов
нет» without checking that block. The user's own constraints still bind it,
exactly as they bind `offers[]`, and each one reports what it removed:

- `direct_only=true` — no block at all (transfers were ruled out).
- `price_max` — capped by the TRIP total →
  `meta.interchange_routes_dropped_over_cap`.
- `carriers` → `meta.interchange_routes_dropped_wrong_carrier`.
- `seat_categories` — the category must be sold on EVERY leg, and the plan is
  re-priced from those fares → `meta.interchange_routes_dropped_wrong_seat_category`,
  plus `meta.interchange_routes_unverified_seat_category` for plans whose leg
  still holds fares upstream left unclassified.

Read those before answering: an empty block with a non-zero DROPPED count
means «пересадки есть, но не проходят ваш фильтр» (name the filter), and a
non-zero UNVERIFIED count means «не удалось проверить категорию» — neither is
«вариантов нет». Say which one it is; offering to relax the filter is the
useful next step.

`price_max` is a WHOLE-TRIP budget, and that is why `search_rail_args` does
NOT carry it: passing it to a per-leg search would allow that amount on EACH
leg and blow the budget by design. When the user set a cap, add the fares you
pick up yourself and keep the SUM within it — the plan's `price_from` is the
cheapest the trip can be, so the room you have on one leg is the cap minus
what the other legs cost.

A plan is NOT an offer: it has no `checkout_ref`, no `details_ref`, no seat
map and no single link — those all describe ONE train. Each plan carries
`legs[]` (train number, stations, times, per-leg `price_from` and either
`seats_left` — checked against the searched party, so «мест осталось N» is
quotable as-is — or `seats_unverified: true`, meaning upstream never stated
availability for that fare: quote the price, promise nothing about seats, and
say it is confirmed on the seat page) and
`transfers[]` (`layover_min`, and `changes_station: true` when the passenger
must cross to another вокзал — say that out loud, it can be 12 km across
Москва). `price_from` is the SUM of each leg's cheapest fare
(`price_basis: sum_of_cheapest_fare_per_leg`), so it moves once classes are
picked — quote it as «от», never as the ticket price.

To book, hand over the legs SEPARATELY — that is Tutu's own flow for a
transfer, not a workaround: two orders, one per train. Each leg carries its
own `checkout_url` (that train's seat-selection page, ready to open); when
the user wants to compare fares or classes first, re-run `search_rail` with
the leg's `search_rail_args` — pass it through VERBATIM rather than
rebuilding the call: it already echoes the searched `passengers` and any
active `carriers` / `seat_categories`, and a rebuilt call that drops them
searches wider than the user asked — then find THIS leg's train
(`legs[].train_number` + `departure_at`) in the result and treat it as
an ordinary rail search — full fares, seat map, straight-to-cart. There is
NO single link or cart for the whole trip; don't promise one. Two separate
tickets also mean the connection is not protected: flag a tight
`layover_min` and suggest a buffer.

That per-leg search returns OTHER trains too, and they are NOT this plan.
The layover, the вокзал change and the total duration hold only for the pair
in `legs[]`. If the user wants a different train on one leg, you are
rebuilding the connection, not picking a fare: check the new train against
the other leg (its arrival must precede `transfers[].departure_at`, or its
departure must follow `transfers[].arrival_at`, with a real buffer — more
when `changes_station` is true), then state the NEW layover and total. If it
doesn't hold, say the connection breaks instead of presenting it. Same for
`checkout_url`: it belongs to the planned train, not to a substitute.

## Checkout
`create_checkout_link` (transport=rail) builds an `explicit/train` deeplink —
a Tutu redirector the user opens in their own session. TWO modes:

1. **Seat page (default, `kind="deeplink"`)** — built from `checkout_ref`'s
   `departure_geo_point_id` / `arrival_geo_point_id` + `train_number` +
   `departure_at`; lands on THIS train's order/seat page where the user
   picks car and seat. Use when the user hasn't chosen exact seats.
2. **Straight-to-cart (`kind="checkout_deeplink"`)** — ONLY after the user
   explicitly confirmed specific seats from `get_rail_seatmap`: pass the
   seat choice (`car_number` + `seat_numbers`, one per passenger) plus
   `offer_hash` + `segment_hash` (and the `search_id`/`result_id`/`card_id`
   metadata) from `checkout_ref`. The link mints the cart with those exact
   seats pre-selected — it works in a COLD browser (no tutu session
   needed; the cart belongs to whoever opens the link). When the user
   picked a fare, ALWAYS pass `fare_type` (the seatmap `fares[].fare_type`
   string: REFUNDABLE or NON_REFUNDABLE) — omitted, the cart opens on the
   refundable default, which is pricier than a chosen non-refundable
   fare. For gender-policy coupes pass `gender_type` (`MALE`/`FEMALE` —
   ask the user). Composition note: the cart holds the SEATS and fare;
   adults/children details are still entered by the user in the cart.
   Tell the user to verify seat/fare in the cart before paying.

If the geo-point ids are missing it falls back to the tutu.ru/poezda/order
page (`kind="order_url"` + a `note`). Quote the price range from `fares` (or
a class+price from `get_offer_details` / exact seat prices from
`get_rail_seatmap`). `search_rail` only surfaces bookable trains (Tutu's
seatless "возможные предложения" — sold-out / advance-sale trains — are
filtered out, since their deeplink would dead-end), so every offer you
present is safe to hand off. If a train sells out between search and click,
the seat-page deeplink degrades gracefully to the route+date search page
(the train is still listed there) — that's expected, not an error; the
straight-to-cart link may instead error on an expired offer — re-run the
search then.

## Cashback
`meta.cashback` states Tutu's loyalty accrual ONCE for the whole page.
These are Tutu bonus points credited to the buyer's Tutu account after
payment — they do NOT reduce `price`. Never present them as a discount,
never subtract them from the fare. No `meta.cashback` at all means nothing
here earns any.

How much it matters depends on `applies_to`:
- `all_fares` — every fare row earns the same rate, so it CANNOT separate
  one train from another. Don't rank on it; mention it at most once, as a
  footnote to the total.
- `most_fares` / `some_fares` — the rate is NOT uniform, and then it can
  genuinely favour one fare over another. `rows_at_rate` of `rows_total`
  says how far from universal it is; `exceptions[]` names what differs —
  an `offer_id`, its `price`, and `variant_id` when a campaign prices one
  fare family only (`exceptions_total` when that list was capped, so read
  the two counters, not the list length). Quote the row by its `price` —
  in the default `compact` view a rail card has no `variants[]` to look
  the id up in (they are folded into `fares`), so re-run with
  `view='full'` if you need that fare's conditions or category. Read it
  before comparing, and if the user cares about cashback, name the rows
  that earn the better rate. Since fare rows no longer carry their own
  cashback, `exceptions[]` is the only place that difference is visible.

## Grounding
Car types, seat counts, double-decker presence and train ratings come from
this response or `get_offer_details` — never invent "обычно бывают
плацкарт / купе / СВ" or substitute web facts.
