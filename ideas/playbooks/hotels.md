# Hotels playbook (`search_hotels` -> `get_offer_details` ->
`create_checkout_link`)

## Checkout
Hotels have an `explicit/hotel` deeplink,
the same stateless handoff family as the transport tools — the user opens
the link and Tutu builds the cart in THEIR browser session (cold browser
works). `create_checkout_link` (product_type=hotels) has TWO modes off the
row's `checkout_ref`:
- **Page (default, `kind="deeplink"`)** — `hotel_alias` + dates + guests
  (+ `search_id`) open the hotel page with everything pre-filled for the
  user to pick a room. This is the official replacement for the old
  `offers/details` page link.
- **Straight-to-cart (`kind="checkout_deeplink"`)** — also pass an
  `offer_pack_hash` and the link mints the cart for that pack. It MUST be a
  SPECIFIC room rate's `offerpack_hash` from `get_offer_details`
  (`rooms[].rates[].offerpack_hash`). The listing `best_offer.offerpack_hash`
  does NOT mint a cart — the redirector falls back
  to the hotel page — so it's not carried in `checkout_ref`; get the cart hash
  from a room the user actually picked (same shape as rail seats from
  `get_rail_seatmap`). A stale/unbookable pack lands on the hotel page instead
  of erroring (`fallback_to_details`), so this mode is always safe.
You can still hand over `best_offer.checkout_url` directly — it's on every
search row. (If a ref lacks `hotel_alias`, the
tool returns that page with `kind="hotel_page"`.)

## geo_id: hotels vs transport (critical)
`search_hotels` resolves `city_name` against Tutu's hotel-specific geo
index — the same one hotel.tutu.ru's search box uses — NOT the transport
suggest. It is region-aware: for a resort zone it picks the `region` that
aggregates the sibling посёлки (e.g. «Курорт "Архыз"» covers посёлок
Архыз + Романтик + Нижний Архыз; the Роза Хутор region covers a locality
that is near-empty on its own), and for a plain city it picks that city.
`meta.resolved_geo` tells you what it searched: `geo_type`
(`region` | `locality`), `hotels_count` (catalog size), and `also_geo`
(the narrower/alternative geos sharing the name).
- ALWAYS prefer `city_name`. State which `resolved_geo.name` was searched;
  when `geo_type=region`, you may add that it covers the whole resort
  zone, and offer an `also_geo` locality if the user wants to narrow.
- **A specific hotel you don't see on page 1 is NOT a different geo.** The
  list is relevance-sorted and a region holds hundreds of properties, so a
  named hotel (especially a new / 0-review one) is usually just deeper —
  paginate (`page`+`page_size`, `meta.has_more`) or fetch it directly with
  `get_offer_details` by its `hotel_id`. Do NOT tell the user it lives in a
  separate geo_id; the region search already spans the zone.
- If you must pass `geo_id`, take it ONLY from a previous `search_hotels`
  response (`meta.geo_id` / `meta.resolved_geo.geo_id` / `also_geo[].geo_id`).
  NEVER reuse a `geo_id` / `from_geo_id` / `to_geo_id` from `search_avia` /
  `search_rail` / `search_bus` / `search_etrain` / `search_multitransport`
  — those are transport entries (airports, stations) and frequently have no
  hotels. Symptom: empty `hotels[]` with `meta.total_returned=0` while
  transport search worked.

## Clarifying questions
When a hotel search has many viable options and the user's message does
NOT pin the narrowing preferences (bed setup, breakfast, free
cancellation, view), do NOT call `search_hotels` yet — ask ONE short batch
(2-4 questions) FIRST, then search. This is a pre-call gate, not a
final-answer step: the mistake is starting the search before knowing what
to narrow by.
- Ask once, concise: bed setup (one double vs two singles), breakfast
  included, free cancellation, view / floor / balcony. With children ->
  also extra bed / cot and family-friendly amenities. Don't re-ask things
  already in the message (dates, city, guest count).
- **The gate is off the moment the user hands you the decision.** A
  deterministic selection rule ("первый найденный", "самый дешёвый",
  "выбери сам", "любой", "лишь бы переночевать", "без уточняющих
  вопросов") or an explicit checkout intent ("оформляй", "кинь ссылку")
  means the preferences you were NOT told are the ones the user doesn't
  care about. Don't ask — search, apply their rule to the actual results,
  and hand over the link in the SAME turn. Treat this as a closed list of
  wordings at your peril: judge the intent, not the phrase. Ask only for a
  REQUIRED field you genuinely cannot fill (city, dates) — a preference is
  never that field.
- Generic positive framing ("хорошее место", "бюджет не критичен") is NOT
  a selection rule and pins nothing — ask anyway.
- Map answers to filters: view/balcony/AC -> `room_amenities`; breakfast
  -> `breakfast_included=true`; free cancel -> `free_cancellation=true`;
  kid-friendly -> `hotel_amenities=['kid_friendly']`; bed preference ->
  annotate from `rooms[].bed_type` in `get_offer_details` (no listing-level
  bed filter today).

## One card = one row = one room
`get_offer_details` takes the hotel id as `offer_id`, `hotel_id` or
`hotel_geo_id` — three names for the same value, so copy whichever the
search row shows and pass exactly ONE. Passing two different ids is an
error, not a preference: it means two rows got mixed.
Each detail response echoes what it is about — `hotel.hotel_id`,
`hotel.name`, `hotel.alias` and `stay {check_in, check_out, nights,
guests}`. Check that echo against the row you meant before you write the
card, especially after a failed call: a rejected call is a reason to fix
the argument NAME, never to try a neighbouring id.
When you present several candidates, build each card from ONE room object
of ONE detail response — `room_name`, `room_size_sqm`, `view`,
`price_from` and the link all come off that object. Never carry a field
sideways from another room or hotel: two rooms of the same hotel routinely
differ only by a word and a metre («Полулюкс, терраса» 39 м² vs «Люкс,
терраса, вид на море» 40 м²), and a card assembled from both describes an
offer that doesn't exist.

## best_offer vs get_offer_details
`best_offer` describes ONLY the cheapest visible rate of one room. For room
categories (standard / comfort / suite), beds, view, size and full
per-rate options, call `get_offer_details`. Each room carries `price_from`
— its OWN cheapest rate, in the same `{amount, currency, price_basis}`
shape as a rate price. Quote that instead of scanning `rates[]` and
picking a minimum by hand; `rates[]` is for comparing meal / cancellation
/ payment options WITHIN the room you already chose. It defaults to
`view='compact'`:
photos are capped, the per-rate `cancellation_policy` ladder text is
omitted (the `free_cancellation` + `free_cancellation_until` flags stay,
so you can still state the policy in one line), room `amenity_groups`
are omitted (the flat `room_amenities` list stays), hotel
`amenity_groups` keep only group + amenity names, and review TEXTS are
omitted — the `review_summary` aggregate (rating, count, aspects) stays.
For the exact cancellation ladder ask `view='rules'`; for guest quotes
(плюсы/минусы from real reviews) ask `view='reviews'` + `review_limit` —
it returns `hotel.reviews[]` with `texts[].sentiment` (pros/cons) and
pagination; `view='full'` returns everything.

## Pricing — whole-stay totals
Every hotel price the tools return is the TOTAL for the requested stay and
guest composition, with the nights already multiplied in: the listing
`best_offer.price`, each `get_offer_details` `rooms[].rates[].price` — both
tagged `price_basis="stay_total"`. Render the number as returned and NEVER
multiply it by the night count; doing so double-counts and overstates the
price. `stay.nights` (top-level in both responses) is only for labelling,
e.g. "42 000 ₽ за 2 ночи". `price_max` is a PER-NIGHT budget — the server
enforces it as `price / stay.nights`, so pass the nightly figure.

## Grounding for asked-for features
Surface the raw field value next to each recommendation and judge
match-vs-mismatch with plain judgment (no decision table).
- View, bed setup -> room-level: `rooms[i].view`, `rooms[i].bed_type`.
- Room area -> in m². The LISTING `best_offer.room_size_sqm` is the more
  reliable source (parsed from the search room_name, e.g. «… от 16 кв.м»);
  `rooms[i].room_size_sqm` in details is usually `null` (Tutu's detail
  upstream rarely carries area). Often a MINIMUM (Tutu's «от N») — label
  «от N м²», don't read it as exact. `null` means Tutu didn't write a size
  (the common case) — say «Tutu не указал площадь», never assume it fails
  or passes a «>35 м²» ask. Do NOT silently drop hotels with unknown size:
  surface the value (or its absence) and let the user decide — a hard size
  cut would empty the list exactly where data is thin (e.g. Сен-Тропе: no
  hotel exposes a size, so a «>35 м²» filter would return zero).
- Breakfast, free cancellation, pay-at-hotel -> RATE-level (rates of one
  room can disagree): `rooms[i].rates[j].*`; in the listing the cheapest
  rate mirrors to `best_offer.breakfast_included` /
  `best_offer.free_cancellation`.
- `view` enum (source `app/repository/hotel_badges.py`): `sea` (explicit
  «на море/океан»), `water` (generic «на воду» — may be pond/canal, NOT
  necessarily sea), `river`, `lake`, `mountain`, `park`, `city`, `yard`,
  `other`, or `None` (Tutu didn't write it). Name the actual enum — don't
  promise «вид на море» when the field says `water`/`river`. When `None`,
  say «Tutu не указал вид». When NO recommended hotel satisfies the ask,
  say so and offer to refine — don't fall back to the cheapest pick as if
  the filter were met.
