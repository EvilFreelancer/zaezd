# Кукбук по Tutu MCP

Все запросы и ответы ниже сняты с боевого сервера 19 августа 2026 года. Ничего не выдумано, ничего не сокращено по смыслу.

## Голое подключение без SDK

Транспорт streamable-http, авторизации нет. Заголовок `Accept` обязан содержать оба типа.

```bash
curl -sS -X POST https://mcp.tutu.ru/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"my-app","version":"0.1.0"}}}'
```

Ответ содержит `serverInfo`, `capabilities` и объёмный блок `instructions`, который стоит прочитать целиком один раз. Уведомление `notifications/initialized` сервер не требует, `tools/list` работает сразу.

Два шелл-хелпера, которыми снималась вся эта документация, лежат в `research/mcp.sh` и `research/tool.sh`.

```bash
./research/tool.sh search_rail '{"origin":"Москва","destination":"Казань","departure_date":"2026-09-05","page_size":2}'
```

## Подключение из кода

TypeScript, официальный SDK.

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "tutu-app", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.tutu.ru/mcp"))
);

const res = await client.callTool({
  name: "search_multitransport",
  arguments: { origin: "Москва", destination: "Казань", departure_date: "2026-09-05" },
});
// структурированного вывода нет, JSON лежит строкой внутри текстового блока
const data = JSON.parse((res.content as any)[0].text);
```

Python, официальный SDK.

```python
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
import json

async with streamablehttp_client("https://mcp.tutu.ru/mcp") as (r, w, _):
    async with ClientSession(r, w) as s:
        await s.initialize()
        out = await s.call_tool("search_hotels", {
            "city_name": "Казань", "check_in": "2026-09-05",
            "check_out": "2026-09-07", "adults": 2})
        data = json.loads(out.content[0].text)
```

Подключение к Claude Code одной строкой.

```bash
claude mcp add --transport http tutu https://mcp.tutu.ru/mcp
```

## Мультитранспорт, один запрос на четыре режима

```json
{"origin":"Москва","destination":"Казань","departure_date":"2026-09-05",
 "optimize_for":"price","page_size":3}
```

Фрагмент реального ответа.

```json
{
  "offer_id": "cf6757af54d6556d32647b07bf2fc993",
  "transport": "railway",
  "price": {"amount": 2090.93, "currency": "RUB"},
  "duration_min": 785,
  "carriers": ["ФПК"],
  "search_results_url": "https://www.tutu.ru/poezda/rasp_d.php?date=05.09.2026&nnst1=2000000&nnst2=2060615",
  "departure_at": "2026-09-05T01:15:00+03:00",
  "arrival_at": "2026-09-05T14:20:00+03:00",
  "legs": [{
    "label": "outbound",
    "from": "Москва — Казанский вокзал (2000003)",
    "to": "Казань — Казань Пасс (2060500)",
    "duration_min": 785,
    "segments": [{"carrier": "ФПК", "voyage_no": "206Х",
                  "from_geo_point_id": 2957765, "to_geo_point_id": 2961212}]
  }],
  "review_summary": {"rating": 7.2, "review_count": 120, "scope": "train", "subject": "206Х"},
  "fares": {"count": 18, "price_from": 2090.93, "price_to": 7320.82,
            "refundable_count": 18, "changeable_count": 0,
            "seat_categories": {"RESERVED_SEAT": {"count": 16, "price_from": 2090.93},
                                "COMPARTMENT": {"count": 2, "price_from": 7320.82}}}
}
```

Что тут стоит заметить. Названия вокзалов настоящие, `Казанский вокзал` против `Казань Пасс`, и это то, чего нет во входных параметрах. Рейтинг поезда 7.2 из 120 отзывов приходит прямо в листинге, отдельный запрос не нужен. Сводка `fares` уже говорит, что купе есть, но от 7320 рублей, а плацкарт от 2090.

Мультитранспорт считает только взрослых. Компанию с детьми надо разводить по конкретным `search_*`.

## Отели, координаты приходят сразу

```json
{"city_name":"Казань","check_in":"2026-09-05","check_out":"2026-09-07",
 "adults":2,"page_size":2}
```

```json
{
  "hotel_id": "9626750",
  "name": "Апарт Отель \"Центральный\"",
  "stars": 0,
  "rating": 8.83,
  "review_count": 88,
  "address": "778 м от центра",
  "location": {"lat": 55.799152, "lng": 49.119747, "city": null, "city_geo_id": null},
  "photos": ["https://cdn2.tu-tu.ru/imghub/view/.../resize_500_500/....jpg"],
  "alias": "apartamenty_bekhtereva1",
  "best_offer": {
    "offerpack_hash": "fbdcdb77-403e-4800-a9d2-80a83098a3a3",
    "room_name": "Апартаменты L",
    "price": {"amount": 15000.0, "currency": "RUB"},
    "price_basis": "stay_total",
    "room_size_sqm": null,
    "breakfast_included": null,
    "free_cancellation": true,
    "highlights": [{"type": "policies", "text": "Бесплатная отмена"}]
  },
  "photos_total": 52
}
```

Три вывода для интерфейса. Первое, `location.lat/lng` есть у каждого отеля, карта строится без единого дополнительного вызова. Второе, `photos` в `compact` содержит одну обложку, а `photos_total` говорит, сколько их всего, в примере 52. Третье, `price_basis: "stay_total"` означает 15 000 рублей за две ночи целиком, умножать на `stay.nights` нельзя.

Поля `room_size_sqm`, `breakfast_included`, `meal_name` часто приходят `null`. Правило сервера строгое, надо сказать "Туту не вернул это поле в текущем ответе", а не догадываться.

Полезные фильтры, которые сервер применяет сам. Звёзды `stars`, максимум за ночь `price_max`, питание `meals`, тип объекта `hotel_types`, минимальный рейтинг `min_rating`, бесплатная отмена `free_cancellation`, завтрак `breakfast_included`, удобства отеля и номера с алиасами вроде `pool`, `spa`, `sea_view`, `balcony`.

## Схема мест в поезде

Вход берётся из `details_ref` оффера, полученного из `search_rail`.

```json
{"details_ref": {"transport":"railway","source":"seats-gateway.seats-by-params",
 "departure_station_code":"2000003","arrival_station_code":"2060500",
 "train_number":"206Х","departure_at":"2026-09-05T01:15:00+03:00"},
 "view":"compact"}
```

Ответ на 85,7 КБ содержит восемь вагонов, 273 места, из которых в `compact` полностью раскрыты 188.

```json
"canvas": {"width": 948, "height": 160,
  "svg_url": "https://cdn1.tu-tu.ru/images2/train/order/car/re/plazcardWOEmergencyExits_1700560633.svg",
  "background_svg_url": "https://cdn1.tu-tu.ru/images2/train/order/car/re/background_plazcardWOEmergencyExits_1700560634.svg"}
```

```json
{"number": "1", "type": "LOWER", "group_index": 2, "compartment_number": 1,
 "deck": null, "gender": "NO_GENDER", "level": "bottom",
 "distance_to_nearest_wc_px": 95.5}
```

Сервер прямо предупреждает, что SVG - это графический контур без текстовых номеров мест, поэтому он годится подложкой, а числа надо брать из `seats[]`. Расстояние до ближайшего туалета уже посчитано в пикселях канваса.

Вместо выкачивания всей карты есть точечные запросы через `task`.

| `task` | Что вернёт |
|---|---|
| `together` | места рядом для компании |
| `far_from_wc` | подальше от туалета |
| `female` | женское купе |
| `summary` | краткая сводка по поезду |

Пагинация схемы своя. `meta.cars_with_more_seats` перечисляет вагоны, у которых места урезаны, `car_number=<id>` подгружает один вагон целиком.

## Сборка ссылки на оплату

Поезд без выбора мест.

```json
{"transport":"railway","departure_city_id":2657260,"arrival_city_id":2656873,
 "departure_station_code":"2000003","arrival_station_code":"2060500",
 "train_number":"206Х","departure_at":"2026-09-05T01:15:00+03:00",
 "departure_geo_point_id":2957765,"arrival_geo_point_id":2961212}
```

```json
{
  "kind": "deeplink",
  "checkout_url": "https://mtp-deeplink.tutu.ru/api/v1/deeplink/explicit/train?geo_mode=unified&departure_time=2026-09-05T01:15:00%2B03:00&departure_geo_point_id=2957765&arrival_geo_point_id=2961212&first_leg_route_number=206%D0%A5&fallback_to_vid=true&source=mcp&departure_geo_city_id=2657260&arrival_geo_city_id=2656873",
  "purchase_url_note": "opens this train's seat-selection page; if the offer is gone it falls back to search"
}
```

Отель.

```json
{
  "checkout_url": "https://mtp-deeplink.tutu.ru/api/v1/deeplink/explicit/hotel?hotel_alias=apartamenty_bekhtereva1&check_in=2026-09-05&check_out=2026-09-07&search_id=506898e8b98dfbdf5fae274926c3ab00&adults=2&source=mcp",
  "fallback_url": "https://hotel.tutu.ru/offers/details?business=0&check_in=...",
  "kind": "deeplink"
}
```

Обратите внимание на `source=mcp` в обеих ссылках, Туту метит трафик от агентов. Для проекта это значит, что атрибуция уже работает и её не надо изобретать.

## Ловушки, на которых легко потерять баллы за стабильность

**Имя параметра даты у каждого домена своё.** У транспорта `departure_date`, у отелей `check_in` и `check_out`. Легаси-алиасы `from_city`, `to_city`, `checkin_date`, `checkout_date` приняты, но `date` не принят вообще. Ошибка выглядит так.

```
Error executing tool search_multitransport: 1 validation error
date  Extra inputs are not permitted [type=extra_forbidden]
```

Сервер на pydantic v2 с `extra=forbid`, любой лишний ключ роняет вызов. Это надо ловить и переспрашивать модель, а не показывать пользователю трейс.

**`geo_id` отелей и `geo_id` транспорта - разные пространства.** Плейбук отелей отдельно предупреждает об этом. Передавать в `search_hotels` можно только id, полученный из предыдущего ответа `search_hotels`.

**`best_offer.offerpack_hash` не чеканит корзину.** Для прямой корзины нужен хэш тарифа конкретного номера из `get_offer_details`.

**Авиа round-trip.** Прямой дип-линкуется, если пробросить `is_round_trip` и `return_departure_at`. Стыковочный откатывается в `kind: "search_redirect"`, и называть это ссылкой на покупку нельзя.

**Состав пассажиров.** Без `passengers_full/child/infant` корзина откроется на одного взрослого.

**Флаг `is_multi_pnr`.** Означает раздельные билеты и самостоятельную стыковку, надо показать `multi_pnr_note` до чекаута.

**Фильтр по перевозчику.** Только эхом имени из `meta.carriers_available`.

## Цена контекста

Суммарный вес описаний и схем всех шестнадцати инструментов - 102 143 символа, примерно 25,5 тысяч токенов на каждый запрос к модели. Если проект работает на модели с коротким контекстом, это надо резать. Способы, проверенные на практике.

- Отдавать модели не все шестнадцать инструментов, а три-четыре под сценарий;
- Держать плейбуки за отдельным вызовом, как это уже сделал Туту, и не тянуть их без нужды;
- Не поднимать `page_size` выше нужного, при пяти офферах авиапоиск уже отдаёт 24 КБ;
- Не звать `get_rail_seatmap` целиком, пользоваться `task` и `car_number`;
- Прокси-слой, который переводит ответ в компактную типизированную форму до того, как он попадёт в контекст.
