# Справочник инструментов Tutu MCP

Сгенерировано из `tools/list` живого сервера `tutu-mcp-server 0.38.0`, протокол `2025-11-25` (сервер поддерживает также 2024-11-05, 2025-03-26, 2025-06-18), транспорт streamable-http.

Всего инструментов: 16. Все помечены `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`. Ни у одного нет `outputSchema` и `_meta`, то есть структурированный вывод и UI-шаблоны сервер не объявляет.

Описания инструментов и параметров приводятся дословно на английском, как их отдаёт сервер. Длинные тире и кавычки-ёлочки в них принадлежат Туту и не правились, иначе справочник перестал бы совпадать с оригиналом.


## `search_hotels`

Search Tutu hotel listings for a given city and date range. Resolve `city_name` (string) OR pass `geo_id` (Tutu internal). Returns hotels with `name`, `stars`, `rating`, `address`, `hotel_id` / `hotel_geo_id` (numeric id for get_offer_details), `tutu_offer_id` (listing UUID, not accepted by details), `review_summary` (when Tutu has reviews), `location`, `photos`, `best_offer` (`price` + `offerpack_hash` + `checkout_url` + `room_size_sqm` (room area in m² when Tutu wrote it in the room name, often as a minimum 'от N'; `null` when absent — say so, don't infer) + normalized rate features: `breakfast_included`, `meal_name`, `free_cancellation`, `pay_at_hotel`, `pay_online`, plus raw `highlights[]` for promo/context badges) — here `checkout_url` IS a real per-hotel page (`hotel.tutu.ru/offers/details?...`) with dates and room composition pre-filled, unlike the transport tools. For checkout yo...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| check_in | `string?` |  | Check-in date, YYYY-MM-DD. `checkin_date` is accepted as a backward-compatible alias. |
| check_out | `string?` |  | Check-out date, YYYY-MM-DD. `checkout_date` is accepted as a backward-compatible alias. Must be after check_in. |
| checkin_date | `string?` |  | Deprecated alias for `check_in`. |
| checkout_date | `string?` |  | Deprecated alias for `check_out`. |
| city_name | `string?` |  | City name (Russian; English/translit also accepted). Resolved via Tutu's hotel-specific, region-aware geo index: a resort name lands the whole zone (e.g. «Курорт Архыз» covering several посёлки), a city lands that city. `meta.reso |
| geo_id | `string?` |  | Tutu hotel city geo_id (e.g. '2657260' for Moscow, '2656873' for Казань). Skip the city_name lookup if provided. WARNING: only pass an id obtained from a previous `search_hotels` response (`meta.geo_id` or `meta.resolved_geo.geo_i |
| adults | `integer` | `1` | Number of adult guests. |
| children_ages | `array<integer>?` |  | Ages of accompanying children, e.g. [6, 12]. Empty/None = no children. |
| page | `integer` | `1` | 1-indexed page number. |
| page_size | `integer` | `10` | Hotels per page. |
| stars | `array<integer>?` |  | Filter: include only these star ratings (1..5, plus 0 for unrated). Multi-select. |
| price_max | `integer?` |  | Filter: maximum price PER NIGHT (RUB). Sent to the upstream as a relevance signal, then enforced server-side as a hard cap on `best_offer.price.amount / stay.nights` — the offer price is a whole-stay total, so it's divided back to |
| meals | `array<string>?` |  | Filter: meal plans, e.g. ['breakfast', 'halfboard', 'allinclusive', 'fullboard', 'lunch', 'dinner', 'nomeal']. |
| hotel_types | `array<string>?` |  | Filter: property types, e.g. ['hotel', 'apartments', 'hostel', 'aparthotel', 'guesthouse']. |
| min_rating | `number?` |  | Filter: minimum aggregated rating (0..10). Mapped to the nearest Tutu rating bucket (>0 / >7 / >8 / >9). |
| free_cancellation | `boolean?` |  | Filter: keep only offers whose cheapest rate advertises free cancellation. Sent via `popular_filters`; treat as best-effort upstream — verify with `best_offer.free_cancellation` per row. |
| breakfast_included | `boolean?` |  | Filter: keep only offers whose cheapest rate includes breakfast. Shortcut for `meals=['breakfast']` plus the `popular_filters` quick toggle. |
| hotel_amenities | `array<string>?` |  | Filter: property-level amenities. Aliases: `pool`, `parking`, `wifi`, `spa`, `transfer`, `kid_friendly`, `pet_friendly`, `kitchen`, `fitness`, `sauna`, `jacuzzi`, `aquapark`, `kids_pool`, `beach`, `elevator`, `minibar`, `fridge`,  |
| room_amenities | `array<string>?` |  | Filter: room-level amenities (best-effort at the listing upstream — the response carries one `best_offer`, so use `get_offer_details` for guaranteed per-room filtering). Aliases: `sea_view`, `mountain_view`, `view`, `balcony`, `ai |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` keeps one cover photo per hotel; `full` keeps a small gallery (a handful of photos, not every one — `photos_total` records the real count, the rest live on the hotel  |

Размер описания и схемы: 10259 символов.

## `search_avia`

Search Tutu air tickets between two cities or specific airports. `origin`/`destination` accept a city ('Москва'), an airport name ('Шереметьево') or a bare IATA code ('SVO', 'IST'). An airport input narrows the city-wide search to that airport: offers via the city's other airports are dropped (count in `meta.post_filter_dropped_wrong_airport`; the key is present only when the request named a specific airport), the endpoint gets `meta.from/to.kind="airport"` and its `iata` becomes the airport's own code. A bare code means the airport, not the metro area ('IST' = Стамбул-Новый only, SAW dropped); pass the city name to cover all its airports. When every city flight uses other airports, `meta.airport_note` lists them with counts — relay it and offer a city-wide retry. Supports one-way and round-trip (`return_date`). Each offer carries: `price` (cheapest fare), `variants[]` (every fare family...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| origin | `string?` |  | Origin city (e.g. 'Москва', 'Moscow', 'Сочи') or a specific airport by name/IATA code ('Внуково', 'VKO') — an airport narrows results to it. Resolved via Tutu suggest. `from_city` is accepted as a backward-compatible alias. |
| destination | `string?` |  | Destination city or a specific airport by name/IATA code ('Шереметьево', 'SVO') — an airport narrows results to it. `to_city` is accepted as a backward-compatible alias. |
| departure_date | `string?` |  | Outbound departure date, YYYY-MM-DD. |
| from_city | `string?` |  | Deprecated alias for `origin`. |
| to_city | `string?` |  | Deprecated alias for `destination`. |
| return_date | `string?` |  | Optional return date, YYYY-MM-DD. When set, the tool asks upstream for a round-trip package and returns offers with both legs (`legs[0]=outbound`, `legs[1]=return`). Crucial for long-haul international routes — some city pairs (e. |
| adults | `integer` | `1` | Adult passengers (12+ years). |
| children | `integer` | `0` | Children (2..11 years). |
| infants | `integer` | `0` | Infants (0..1 years). |
| service_class | `string` | `Y` | IATA service class: Y=economy, S=premium economy, C=business, F=first. |
| page | `integer` | `1` | 1-indexed page number. Each page carries up to `page_size` offers. Check `meta.has_more` to know if another page exists. |
| page_size | `integer` | `10` | Offers per page (1..30). Default 10. |
| sort | `enum(price_asc, price_desc, duration_asc, departure_asc)` | `price_asc` | Ordering applied before pagination. `price_asc` (cheapest first), `price_desc`, `duration_asc` (shortest first), `departure_asc` (earliest departure). |
| price_max | `number?` |  | Hard cap on price per offer (RUB). Enforced server-side. |
| direct_only | `boolean` | `False` | Keep only nonstop flights (every leg a single segment; correct for round-trip). Client-side post-filter; dropped count in `meta.post_filter_dropped_not_direct`. |
| carriers | `array<string>?` |  | Keep only offers by these airlines. Pass a `name` from `meta.carriers_available` (e.g. 'Аэрофлот'); an `id` also works when that entry carries one. Do NOT guess spelling: 'aeroflot' will not match 'Аэрофлот'. Case-insensitive subs |
| flight_numbers | `array<string>?` |  | Keep only offers containing one of these flights — THE way to answer «возьми рейс N»: one call instead of paging through the day. Accepts the full designator in any spelling ('SU-6176', 'SU 6176', 'su6176' — case, separators and l |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` returns lean decision cards — rail collapses the long per-class fare list to a `fares` summary {count, price_from, price_to, currency, refundable_count?, changeable_c |

Размер описания и схемы: 12207 символов.

## `search_rail`

Search Russian Railways (РЖД) tickets between two cities. Returns the real departure & arrival station names per offer (useful when a city has several stations — Москва has Курский / Ленинградский / Казанский). Each offer carries: `price`, a `fares` summary in the default `compact` view (`{count, price_from, price_to, currency, refundable_count?, changeable_count?, refundable_unknown?, changeable_unknown?, seat_categories?, uncategorized_fares?}` — the counts say how many fare rows are KNOWN refundable / exchangeable, so `refundable_count: 0` means «none confirmed refundable», not «no refundable fare exists»; `refundable_unknown` / `changeable_unknown` count the rows upstream left unresolved on that field (absent when every row resolved it), and while they are present the zero proves nothing — say the check was inconclusive for N тарифов instead of denying. A count itself is absent when ...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| origin | `string?` |  | Origin city or station name. `from_city` is accepted as a backward-compatible alias. |
| destination | `string?` |  | Destination city or station name. `to_city` is accepted as a backward-compatible alias. |
| departure_date | `string?` |  | Departure date, YYYY-MM-DD. |
| from_city | `string?` |  | Deprecated alias for `origin`. |
| to_city | `string?` |  | Deprecated alias for `destination`. |
| passengers | `integer` | `1` | Number of adult passengers. |
| page | `integer` | `1` | 1-indexed page number. |
| page_size | `integer` | `10` | Offers per page. |
| sort | `enum(price_asc, price_desc, duration_asc, departure_asc)` | `price_asc` | Ordering applied before pagination. |
| price_max | `number?` |  | Hard cap on price per offer (RUB). Enforced server-side. |
| direct_only | `boolean` | `False` | Keep only direct trains (no transfers — every leg a single segment). Dropped count in `meta.post_filter_dropped_not_direct`. |
| carriers | `array<string>?` |  | Keep only offers by these carriers (e.g. 'ФПК'). Pass a `name` from `meta.carriers_available` (the operators present in this result set); case-insensitive substring, an empty list is a no-op. All carriers on a multi-carrier offer  |
| train_numbers | `array<string>?` |  | Keep only offers carrying one of these train numbers (e.g. '750У') — THE way to answer «возьми поезд N»: one call instead of paging through the whole day. Matches every segment's bookable number AND its display form (a through tra |
| seat_categories | `array<string>?` |  | Keep only trains selling at least one fare in these car categories: 'SEDENTARY' (сидячий), 'RESERVED_SEAT' (плацкарт), 'COMPARTMENT' (купе), 'LUX' (СВ), 'SOFT' (мягкий), 'SHARED' (общий). Case-insensitive; any other value is REJEC |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` returns lean decision cards — rail collapses the long per-class fare list to a `fares` summary {count, price_from, price_to, currency, refundable_count?, changeable_c |

Размер описания и схемы: 15902 символов.

## `search_bus`

Search Tutu intercity bus tickets between two cities. Each offer carries: `price`, `variants[]` (where the carrier offers several tariffs), `legs[].segments[]` with stop names and carrier ratings in `review_summary` when Tutu returns feedback, `search_results_url` (tutu.ru listing), and `checkout_url` (Tutu `explicit/bus` deeplink to this offer's seat-selection page). Prices cover the WHOLE searched party (`adults` + `children`), and `checkout_ref` carries that composition (`passengers` total + `passengers_adult` / `passengers_child`) — forward it verbatim so registration books the same party. `checkout_ref` can rebuild the link, especially for a non-cheapest tariff. `details_ref` can be passed to `get_offer_details(product_type='bus', ...)` to load stops, carrier, structured `amenities[]` (wifi / air_conditioning / power_outlet / toilet flags as machine-readable codes), `ticket` (eticke...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| origin | `string?` |  | Origin city. `from_city` is accepted as a backward-compatible alias. |
| destination | `string?` |  | Destination city. `to_city` is accepted as a backward-compatible alias. |
| departure_date | `string?` |  | Departure date, YYYY-MM-DD. |
| from_city | `string?` |  | Deprecated alias for `origin`. |
| to_city | `string?` |  | Deprecated alias for `destination`. |
| adults | `integer` | `1` | Number of adult passengers. |
| children | `integer` | `0` | Number of children travelling on a child fare (each occupies a seat; the age limit and any discount are carrier-specific — never promise a discount the price doesn't show). Offer prices cover the WHOLE searched party (adults + chi |
| page | `integer` | `1` | 1-indexed page number. |
| page_size | `integer` | `10` | Offers per page. |
| sort | `enum(price_asc, price_desc, duration_asc, departure_asc)` | `price_asc` | Ordering applied before pagination. |
| price_max | `number?` |  | Hard cap on price per offer (RUB). Enforced server-side. |
| direct_only | `boolean` | `False` | Keep only direct buses (no transfers — every leg a single segment). Dropped count in `meta.post_filter_dropped_not_direct`. |
| carriers | `array<string>?` |  | Keep only offers by these carriers (e.g. 'Ecolines'). Pass a `name` from `meta.carriers_available` (the operators present in this result set); case-insensitive substring, an empty list is a no-op. All carriers on a multi-carrier o |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` returns lean decision cards — rail collapses the long per-class fare list to a `fares` summary {count, price_from, price_to, currency, refundable_count?, changeable_c |

Размер описания и схемы: 6379 символов.

## `search_etrain`

Search Tutu suburban / commuter trains (электрички) between two cities. Useful for short routes around Москва / СПб / regional centres. Each offer carries the same shape as `search_rail`: `price`, `variants[]`, `legs[].segments[]`, `search_results_url`, `checkout_url` (tutu.ru commuter schedule page with `st1` / `st2` route ids), and `checkout_ref` for rebuilding the link if needed. Each segment carries `vehicle_meta` ({name: Ласточка/Дальний, code: swallow/distant, description}) when Tutu's dictionary provides it — use this to filter consist type without parsing labels. No separate read-only detail endpoint is confirmed for etrain; `get_offer_details(product_type='etrain', details_ref=<offer>)` reformats the selected search offer with a `ticket` block (eticket, by_passport) and surfaces `vehicle_type` in summary. Paginated + sortable. `meta.cashback` is normally ABSENT here — commuter t...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| origin | `string?` |  | Origin city or station name. `from_city` is accepted as a backward-compatible alias. |
| destination | `string?` |  | Destination city or station name. `to_city` is accepted as a backward-compatible alias. |
| departure_date | `string?` |  | Departure date, YYYY-MM-DD. |
| from_city | `string?` |  | Deprecated alias for `origin`. |
| to_city | `string?` |  | Deprecated alias for `destination`. |
| page | `integer` | `1` | 1-indexed page number. |
| page_size | `integer` | `10` | Offers per page. |
| sort | `enum(price_asc, price_desc, duration_asc, departure_asc)` | `price_asc` | Ordering applied before pagination. |
| price_max | `number?` |  | Hard cap on price per offer (RUB). Enforced server-side. |
| direct_only | `boolean` | `False` | Keep only single-segment commuter offers. Accepted for interface parity with the other transports; on etrain it is nearly always a no-op (commuter offers are single-segment). Dropped count in `meta.post_filter_dropped_not_direct`. |
| carriers | `array<string>?` |  | Keep only offers by these carriers. Accepted for parity; commuter offers often carry no named carrier, so this frequently drops everything or nothing — inspect `meta.carriers_available` first. Case-insensitive substring; empty lis |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` returns lean decision cards — rail collapses the long per-class fare list to a `fares` summary {count, price_from, price_to, currency, refundable_count?, changeable_c |

Размер описания и схемы: 4977 символов.

## `search_multitransport`

One-call multimodal 'how to get there' — runs avia + railway + bus + etrain in parallel and returns a unified sorted list under `variants[]`. NB rail can also answer OUTSIDE that list: on a route with no direct train, `meta.modes_summary.railway.interchange_routes` holds two-train transfer PLANS while `variants[]` stays empty for that mode — they are route suggestions, not bookable variants (no single ticket, cart or link for the whole trip), so they are not ranked among the others. Do NOT read an empty rail entry as «поездов нет» without checking that block; the same filter counters ride along (`interchange_routes_dropped_over_cap` / `..._wrong_carrier` / `..._wrong_seat_category` / `..._unverified_seat_category`), and a non-zero one next to an empty block means «есть, но не проходят фильтр», not «нет». Shape and booking rules are identical to `search_rail`'s `meta.interchange_routes` —...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| origin | `string?` |  | Origin city. Pass a CITY here — a specific airport (name/IATA code) only makes sense for the avia mode; use `search_avia` for that. `from_city` is accepted as a backward-compatible alias. |
| destination | `string?` |  | Destination city. Pass a CITY here — a specific airport (name/IATA code) only makes sense for the avia mode; use `search_avia` for that. `to_city` is accepted as a backward-compatible alias. |
| departure_date | `string?` |  | Departure date, YYYY-MM-DD. |
| from_city | `string?` |  | Deprecated alias for `origin`. |
| to_city | `string?` |  | Deprecated alias for `destination`. |
| adults | `integer` | `1` | Number of adult passengers. Multitransport searches ADULTS ONLY — for a party with children run the concrete mode's search instead (`search_avia` / `search_bus` take `children`), so offers are priced for the real party. |
| modes | `array<string>?` |  | Subset of modes to include. Default: all four. |
| optimize_for | `enum(price, time)` | `price` | Sort variants by total price (default) or by total trip duration. |
| page | `integer` | `1` | 1-indexed page number. |
| page_size | `integer` | `10` | Variants per page after merging across modes. |
| price_max | `number?` |  | Hard cap on price per variant (RUB). Applied to every mode independently. |
| direct_only | `boolean` | `False` | Keep only direct offers (no transfers) in every mode. Applied per-mode, like `price_max`. |
| carriers | `array<string>?` |  | Keep only offers by these carriers in every mode. Case-insensitive substring on carrier display names (pass values echoed from a per-mode search's `meta.carriers_available`); an empty list is a no-op. All carriers on a multi-carri |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` returns lean decision cards — rail collapses the long per-class fare list to a `fares` summary {count, price_from, price_to, currency, refundable_count?, changeable_c |

Размер описания и схемы: 7626 символов.

## `get_offer_details`

Fetch details for a single offer. Defaults to `view='compact'`: for hotels it caps photos, omits the per-rate `cancellation_policy` text (the `free_cancellation` / `free_cancellation_until` flags stay), omits room `amenity_groups` (flat `room_amenities` stays) and omits review TEXTS — the `review_summary` aggregate stays. Use `view='rules'` for the exact cancellation ladder, `view='reviews'` + `review_limit` for a feedback-only card (review texts with pagination; rooms collapse to stubs), or `view='full'` for everything. Transport details ignore `view`. `product_type=hotels` takes the hotel id under any of `offer_id` / `hotel_id` / `hotel_geo_id` — three names for the SAME value, so copy the field off the `search_hotels` row and pass exactly one (two different ids is an error: it means two rows got mixed). It returns hotel info (name, address, photos, hotel-level amenities, rules, `revie...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| **product_type** | `enum(hotels, avia, rail, railway, bus, etrain)` |  | Type of offer to inspect. Only `hotels` has text reviews; rail/bus have read-only detail endpoints. |
| offer_id | `string?` |  | REQUIRED for `hotels` (or its aliases `hotel_id` / `hotel_geo_id` — same value, pass any ONE): Tutu hotel id, i.e. the `hotel_id` / `hotel_geo_id` field of the search_hotels row you are detailing, the numeric id used in details UR |
| hotel_id | `string?` |  | Alias for `offer_id`, named as `search_hotels` returns it. Pass one of the three, not several. |
| hotel_geo_id | `string?` |  | Alias for `offer_id`, named as `search_hotels` and `create_checkout_link` spell it. |
| details_ref | `object?` |  | For `rail` and `bus`: pass `offer.details_ref` from the corresponding search result verbatim. For `avia`/`etrain`: pass the selected compact offer object if you want a presentation-ready reformat without side effects. |
| check_in | `string?` |  | Required for `hotels`. YYYY-MM-DD. |
| check_out | `string?` |  | Required for `hotels`. YYYY-MM-DD. |
| adults | `integer` | `2` | Number of adult guests. |
| children_ages | `array<integer>?` |  | Ages of accompanying children. |
| review_limit | `integer` | `5` | For `hotels`: number of review texts to return in `view='reviews'` / `view='full'`. Default 5, max 50; page with `review_offset`. Ignored by `compact`/`rules` — those views carry only `review_summary` and skip the review fetch ent |
| review_offset | `integer` | `0` | For `hotels`: review pagination offset. Use `hotel.reviews.pagination.has_more` to fetch next page. |
| review_sort | `enum(postedAt, rating)` | `postedAt` | For `hotels`: sort review texts by date or rating. |
| review_order | `enum(desc, asc)` | `desc` | For `hotels`: review sort order. |
| review_topics | `string?` |  | For `hotels`: optional topic filter from `hotel.reviews.topics`. Empty/None = all topics. |
| view | `enum(compact, rules, reviews, full)` | `compact` | Response detail level. Hotel detail scope: `compact` (default) / `rules` / `reviews` / `full`. `compact` is the lean decision card: room photos capped, per-rate `cancellation_policy` text dropped (the decision facts stay in `free_ |

Размер описания и схемы: 9007 символов.

## `get_rail_seatmap`

Read-only per-car seat layout for a selected rail offer. Authoritative next step after `search_rail` for ANY question about exact seats, car layout, female/male/mixed compartments, lower/upper or nearby seats, or WC distance: if a rail offer has `details_ref`, CALL this — never tell the user the seat map is unavailable without calling, and read `seatmap_status` to tell a real layout (`ok`) from `no_layout_for_carrier`. Top-level `seatmap_status`: `"ok"` when Tutu returned a schema, `"no_layout_for_carrier"` when Tutu has none for that train. The fallback is RARE — every train sampled live returned a layout, commercial brands included — so treat a layout as the norm and never predict its absence. In the fallback case `cars=[]` and an `agent_hint` field spells out that this is NOT 'no seats' — just 'no schema'. On success, `cars[]` carries every car of the train: `{car_number, car_type, se...

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| **details_ref** | `object` |  | Pass `offer.details_ref` from `search_rail` verbatim. Required keys: `departure_station_code`, `arrival_station_code`, `departure_at`, `train_number`. |
| car_number | `string?` |  | Load all seats of a single car (no per-car cap). Use after a default-paginated call when the agent needs every seat in a specific car for fine-grained preference matching. Match value comes from `cars[].car_number` in a prior resp |
| max_cars | `integer` | `5` | How many cars come back with full seats. Cars beyond this cap still appear in `cars[]` as skeletons (`seats=[]` + `seats_omitted_for_pagination=true`) so the agent sees the full train shape. Default 5 keeps the payload under the 6 |
| max_seats_per_car | `integer` | `40` | Cap on seats inside each returned car (ignored when `car_number` is set). When the cap kicks in, that car gets `seats_omitted_for_pagination=true` and shows up in `meta.cars_with_more_seats` — call again with `car_number=<id>` for |
| view | `enum(compact, full)` | `compact` | Response detail level: `compact` (default) or `full`. `compact` drops the per-seat rendering geometry (`position`, `size`, `nearest_wc_rect`) that the agent never needs — decisions use the precomputed `distance_to_nearest_wc_px` a |
| task | `enum(far_from_wc, female, summary, together)` |  | Optional focused query over the WHOLE train instead of the full per-car layout — returns a short ranked answer, not hundreds of seats: `far_from_wc` (farthest seats by `distance_to_nearest_wc_px`, ranked per berth type in `seats_b |
| seats_together | `integer` | `2` | Party size for `task='together'` (2-6, default 2) — ignored by every other task. Returns `groups_by_car_type`: per car category, up to 4 candidate groups of exactly this many free seats that share ONE section, cheapest-first. A gr |

Размер описания и схемы: 11063 символов.

## `get_avia_instructions`

Detailed avia playbook: airport disambiguation, airport-scoped search (origin/destination by airport name or IATA code), deeplink vs search-results checkout, fare-family override, baggage/refund grounding. Read before working with `search_avia` results.

Размер описания и схемы: 359 символов.

## `get_rail_instructions`

Detailed rail playbook: `get_rail_seatmap` workflow (pagination, seat types, group_index join, per-group fare variants, focused `task=` queries incl. `together` for «места рядом», no-layout fallback), gender-coupe rules, `get_offer_details` and checkout (seat page vs straight-to-cart with chosen seats). Read before working with `search_rail` results.

Размер описания и схемы: 458 символов.

## `get_bus_instructions`

Detailed bus playbook: passengers (adults + children, whole-party pricing, composition in `checkout_ref`), stop presentation, `get_offer_details` (amenities/refund/luggage/seat_selection), checkout (seat page vs straight-to-cart with chosen seats) and grounding. Read before working with `search_bus` results.

Размер описания и схемы: 415 символов.

## `get_etrain_instructions`

Detailed etrain (commuter) playbook: `vehicle_meta` consist type, `get_offer_details` reformat, checkout and grounding. Read before working with `search_etrain` results.

Размер описания и схемы: 275 символов.

## `get_hotels_instructions`

Detailed hotels playbook: hotels-vs-transport `geo_id` pitfall, clarifying questions, `best_offer` vs `get_offer_details`, view/bed/breakfast grounding. Read before working with `search_hotels` results.

Размер описания и схемы: 308 символов.

## `get_multitransport_instructions`

Detailed multitransport playbook: nested `variants[]`, `optimize_for`, per-mode soft-fail, and how checkout defers to the per-mode playbooks. Read before working with `search_multitransport` results.

Размер описания и схемы: 305 символов.

## `create_checkout_link`

The single 'proceed to checkout' handle for a previously found offer. Pass the fields from the offer's `checkout_ref` object (emitted by every `search_hotels` / `search_avia` / `search_rail` / `search_bus` / `search_etrain` / `search_multitransport` result); the tool dispatches by `product_type` (or the `transport` alias). Returns `{checkout_url, kind, ...}`.

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| product_type | `enum(avia, rail, railway, etrain, bus, hotels)` |  | Product type of the offer. `railway` and `rail` are accepted as synonyms. Optional when passing `transport` from checkout_ref. |
| transport | `enum(avia, rail, railway, etrain, bus, hotels)` |  | Backward-compatible alias for `product_type`; matches the `transport` key emitted in checkout_ref. |
| search_results_url | `string?` |  | For `avia`: the avia.tutu.ru search-results URL emitted in `checkout_ref.search_results_url`. Always returned alongside the deeplink so the user can fall back to browsing the listing page. |
| departure_geo_city_id | `integer?` |  | For `avia`: departure city id (`legs[0].segments[0].from.city_id`, also in `checkout_ref.departure_geo_city_id`). Required for the mtp-deeplink purchase URL. |
| arrival_geo_city_id | `integer?` |  | For `avia`: arrival city id (`legs[-1].segments[-1].to.city_id`, also in `checkout_ref.arrival_geo_city_id`). Required for the mtp-deeplink purchase URL. |
| service_class | `string|integer?` |  | For `avia`: cabin class of the chosen variant. Three input shapes accepted: Tutu's upstream code (`ECONOMIC`/`PREMIUM_ECONOMY`/`BUSINESS`/`FIRST` — preferred, lives on each variant as `variants[i].service_class` and on the cheapes |
| passengers_full | `integer?` |  | For `avia`: number of adults the search was for (`checkout_ref.passengers_full`). Pass it so the deeplink requests the SAME party you quoted — omit and Tutu defaults the cart to one adult, so a multi-passenger total won't match. F |
| passengers_child | `integer?` |  | For `avia`: number of children (2–11 yrs) (`checkout_ref.passengers_child`). See `passengers_full`. |
| passengers_infant | `integer?` |  | For `avia`: number of infants (<2 yrs, lap) (`checkout_ref.passengers_infant`). See `passengers_full`. |
| departure_avia_id | `string|integer?` |  | Accepted from `checkout_ref` (avia orders-API city id, used by `register_checkout_passengers`); ignored here — safe to forward. |
| arrival_avia_id | `string|integer?` |  | Accepted from `checkout_ref` (avia orders-API city id, used by `register_checkout_passengers`); ignored here — safe to forward. |
| passengers_adult | `integer?` |  | Accepted from a bus `checkout_ref` (the adult share of the searched party, checked by `register_checkout_passengers`); ignored here — safe to forward. |
| is_round_trip | `boolean?` |  | For `avia`: pass `checkout_ref.is_round_trip`. A direct round-trip offer builds a TWO-leg deeplink (both legs in one cart) — the tool joins the per-leg hashes and adds the return departure from `return_departure_at`. Connecting ro |
| return_departure_at | `string?` |  | For round-trip `avia`: ISO-8601 departure of the RETURN leg's first segment (`checkout_ref.return_departure_at` = `legs[1].segments[0].departure_at`, e.g. `2026-07-19T10:00:00+03:00`). Required to build a two-leg direct round-trip |
| offer_hash | `string|object?` |  | For `avia`: the stringified JSON from `offer.variants[i].offer_hash`; the deeplink hashes are extracted from it to build the purchase URL. A direct round-trip offer_hash carries both legs — the tool joins them and needs `return_de |
| departure_city_id | `integer?` |  | For `rail`: origin city id (`departure_st`). |
| arrival_city_id | `integer?` |  | For `rail`: destination city id (`arrival_st`). |
| departure_station_code | `string?` |  | For `rail`: origin station code (`dep_st`, e.g. `2000001`). For `etrain` this is retained as a compatibility/debug field. |
| arrival_station_code | `string?` |  | For `rail`: destination station code (`arr_st`). For `etrain` this is retained as a compatibility/debug field. |
| departure_etrain_id | `integer?` |  | For `etrain`: origin station id for tutu.ru commuter schedule pages (`st1`). |
| arrival_etrain_id | `integer?` |  | For `etrain`: destination station id for tutu.ru commuter schedule pages (`st2`). |
| train_number | `string?` |  | For `rail`: the Express-3 train number such as `022А`. Copy it from `offer.checkout_ref.train_number` — do NOT read `segments[].voyage_no`, which is the passenger display number and differs from the bookable number for through-tra |
| city_from | `string?` |  | For `bus`: origin city name. |
| city_to | `string?` |  | For `bus`: destination city name. |
| departure_id | `integer?` |  | For `bus`: origin route id for `search[from]` on bus.tutu.ru/seats. Prefer this field from checkout_ref. |
| arrival_id | `integer?` |  | For `bus`: destination route id for `search[to]` on bus.tutu.ru/seats. Prefer this field from checkout_ref. |
| departure_stop_id | `integer?` |  | For `bus`: display/debug origin stop geo-point id. Older checkout_ref objects used this as `search[from]`; new objects should also pass `departure_id`. |
| arrival_stop_id | `integer?` |  | For `bus`: display/debug destination stop geo-point id. Older checkout_ref objects used this as `search[to]`; new objects should also pass `arrival_id`. |
| departure_stop_name | `string?` |  | For `bus`: display name for the origin stop. Accepted for pass-through compatibility; URL building uses `departure_id` when present. |
| arrival_stop_name | `string?` |  | For `bus`: display name for the destination stop. Accepted for pass-through compatibility; URL building uses `arrival_id` when present. |
| passengers | `integer` | `1` | For the bus fallback `seats_url`: number of passengers to prefill. Rail deeplinks/order URLs do not preselect passengers or seats. |
| departure_geo_point_id | `integer?` |  | For `rail`: origin segment geo-point id (`checkout_ref.departure_geo_point_id` = `legs[0].segments[0].from.geo_point_id`). Required for the rail `explicit/train` deeplink. |
| arrival_geo_point_id | `integer?` |  | For `rail`: destination segment geo-point id (`checkout_ref.arrival_geo_point_id`). Required for the rail `explicit/train` deeplink. |
| segment_hash | `string?` |  | For `rail` straight-to-cart: the offer's segment hash (`checkout_ref.segment_hash`). Required together with `offer_hash`, `car_number` and `seat_numbers` to mint the cart. |
| car_number | `string|integer?` |  | For `rail` straight-to-cart: the chosen car (`cars[].car_number` from `get_rail_seatmap`). |
| seat_numbers | `array<any>?` |  | Straight-to-cart seat choice, ONE seat per passenger. For `rail`: `seats[].number` values from `get_rail_seatmap` (all in the same `car_number`). For `bus`: ids from `get_offer_details` `seat_selection.available_seat_ids`. Pass ON |
| fare_type | `string|integer?` |  | For `rail` straight-to-cart: the chosen fare type — pass the seatmap `fares[].fare_type` string (`REFUNDABLE`→1, `NON_REFUNDABLE`→2) or Tutu's integer code directly. ALWAYS pass it when the user picked a fare: omitted, the cart op |
| gender_type | `string|integer?` |  | For `rail` straight-to-cart, gender-policy coupes only: which gender the compartment is sold as — `MALE`/`FEMALE` (ask the user; `MIXED`/`NO_GENDER` and ints 0..3 also accepted). Omit for regular cars. |
| search_id | `string?` |  | `checkout_ref.search_id` — the searchId of the search the offer came from. REQUIRED for the `bus` straight-to-cart mode; optional metadata for `rail`. |
| result_id | `string?` |  | For `rail` straight-to-cart: `checkout_ref.result_id` metadata (optional). |
| card_id | `string?` |  | For `rail` straight-to-cart: `checkout_ref.card_id` metadata (optional). |
| seat_count | `integer?` |  | For `bus` straight-to-cart: number of passengers. Defaults to the number of `seat_numbers` passed. |
| hotel_alias | `string?` |  | For `hotels`: the hotel's `/h_<alias>/` slug (`checkout_ref.hotel_alias`, also `best_offer`/row `alias` from `search_hotels` or `hotel.alias` from `get_offer_details`). Required to build the `explicit/hotel` deeplink; without it t |
| offer_pack_hash | `string?` |  | For `hotels` straight-to-cart: a ROOM rate's `rooms[].rates[].offerpack_hash` from `get_offer_details` — pass it once the user picked a specific room and the deeplink mints the cart for that pack (`checkout=true`), falling back to |
| hotel_geo_id | `string|integer?` |  | For `hotels`: the hotel's geo id (`checkout_ref.hotel_geo_id`). Display/debug; the page URL comes from `fallback_url`. |
| check_in | `string?` |  | For `hotels`: check-in date `YYYY-MM-DD` (`checkout_ref.check_in`). |
| check_out | `string?` |  | For `hotels`: check-out date `YYYY-MM-DD` (`checkout_ref.check_out`). |
| adults | `integer?` |  | For `hotels`: number of adults (`checkout_ref.adults`). |
| children_ages | `array<integer>?` |  | For `hotels`: child ages (`checkout_ref.children_ages`), if any. |
| fallback_url | `string?` |  | For `hotels`: the pre-filled hotel page (`checkout_ref.fallback_url` / `best_offer.checkout_url`) — this is what hotels checkout returns. |
| departure_at | `string?` |  | ISO-8601 departure datetime from the offer's first segment (e.g. `2026-04-30T13:30:00+03:00`). Used by rail (`date`), etrain (`date`), and bus (`search[on]` + `trip[start_time]`). |

Размер описания и схемы: 21841 символов.

## `fetch_resource`

Read a `tutu://` server resource and return its content. Use this when your MCP client doesn't auto-surface server resources in the prompt. Valid URIs: `tutu://help/overview` (full agent guide — start here), `tutu://geo` (city/point ids), `tutu://status` (server + upstream health), `tutu://special-offers` (experimental inspiration only). Returns `{uri, mime_type, content}`.

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| **uri** | `enum(tutu://help/overview, tutu://geo, tutu://status, tutu://special-offers)` |  | Resource URI. Start with `tutu://help/overview` for the agent-facing reference. |

Размер описания и схемы: 762 символов.

