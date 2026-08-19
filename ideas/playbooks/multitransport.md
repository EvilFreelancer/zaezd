# Multitransport playbook (`search_multitransport`)

One call fans out avia + railway + bus + etrain in parallel and returns a
unified, sorted top-level `variants[]`. NOTE the nesting AND the rail
exception: each top-level entry is a cross-mode option that, in the default
`compact` view, carries its own fare-family `variants[]` for avia/bus/etrain
— but a RAIL entry instead carries a `fares` summary `{count, price_from,
price_to, currency, refundable_count?, changeable_count?,
refundable_unknown?, changeable_unknown?,
seat_categories?, uncategorized_fares?}` (no nested
`variants[]`/`offer_hash`); `seat_categories` gives the car categories on
sale (сидячий / плацкарт / купе / СВ) with their `price_from`, and a
category missing from it is not on sale — unless `uncategorized_fares`
says some rows couldn't be classified, in which case say so instead of
declaring the category absent — it bounds the CATEGORY ladder only, since
this tool has no category filter and those rows are still counted by the
refund / exchange totals. `refundable_unknown` / `changeable_unknown`
carry the same «неизвестно, а не нет» signal one field over: while either
is present, a zero count rules nothing out. Class NAMES and amenities come from
`get_offer_details(product_type='rail')` and nowhere else — a re-run with
`view='full'` brings back the per-fare rows (price, `conditions`,
`service_class` code, `seat_category`, `seats_left`), not the class cards.
- `optimize_for='price'|'time'` ranks per mode; `modes` narrows the subset
  (default all four).
- ADULTS ONLY: multitransport takes `adults` and prices every mode for
  adults. For a party with children run the concrete mode's search
  (`search_avia` / `search_bus` take `children`) — its offers are priced
  for the real party, and registration checks the composition against
  what was searched.
- Soft-fails per mode: a down upstream shows up in `meta.unavailable[]` and
  the rest of the result stays usable.
- Prefer CITY input here. If origin/destination names a specific airport,
  only the avia mode narrows to it (other modes search the city or fail
  to resolve); the avia drop counter / note then surface under
  `meta.modes_summary.avia` (`dropped_wrong_airport`, `airport_note`) —
  use them to explain a thin avia block.
- `meta.modes_summary.railway.interchange_routes` appears when no direct
  train runs the route: two-train PLANS, not variants (they stay out of the
  ranked list — a plan has no single ticket or link). Same shape and same
  rules as `search_rail`'s `meta.interchange_routes`; book them leg by leg.
  `interchange_routes_dropped_over_cap` rides along even when the block is
  empty — that's «пересадки есть, но дороже `price_max`», not «поездов нет».
- `meta.modes_summary.<mode>.cashback` carries that mode's loyalty rate —
  per mode, because the rate differs by product. Same rules as the
  single-mode tools: bonus points credited after payment, NOT money off
  `price`, never presented as a discount. Absent for a mode that earns
  none. `scope: "mode_page"` is a warning label: the rate and the
  `rows_at_rate` / `rows_total` counters describe that mode's own FETCHED
  page — the same population as `count` and `min_price` beside them —
  which is neither the merged page you are showing nor everything the
  mode matched. Never present that coverage as exhaustive. `exceptions[]`
  here is narrowed to offers actually on the merged page; for the full
  per-fare breakdown re-run that mode's own `search_*`.
- Checkout / detail per entry follows the SAME rules as the single-mode
  tool for that transport: use `checkout_url` when present, else
  `create_checkout_link` with `checkout_ref`; `details_ref` is present for
  rail/bus. For per-mode fields, edge-cases and grounding, read that mode's
  instruction tool (`get_avia_instructions` / `get_rail_instructions` /
  `get_bus_instructions` / `get_etrain_instructions`).
