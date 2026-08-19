# Архитектура

Одна схема компонентов и две последовательности. Решения с обоснованиями лежат отдельно, в
[decisions.md](decisions.md); здесь только то, как всё устроено.

## Компоненты

```mermaid
flowchart TB
  subgraph delivery["L4 доставка"]
    web["src/web<br/>экран trip board"]
    mcp["src/mcp<br/>find_event_trips<br/>get_trip_details<br/>create_trip_checkout<br/>ui://zaezd/trip-board"]
  end

  subgraph orchestration["L3 оркестрация"]
    build["build-trip.ts<br/>сборка поездки"]
    checkout["build-checkout.ts<br/>живые ссылки на оплату"]
    tripid["trip-id.ts<br/>запрос в ссылке"]
  end

  subgraph enrich["L2 обогащение, всё необязательное"]
    geo["geo.ts<br/>Nominatim, OSRM"]
    cal["calendar.ts<br/>isDayOff"]
    weather["weather.ts<br/>Open-Meteo"]
  end

  subgraph sources["L1 источники"]
    confcal["confcal.ts<br/>каталог событий"]
    tutu["tutu.ts<br/>транспорт и отели"]
    normalize["normalize.ts<br/>разбор ответов"]
    cache["cache.ts<br/>кэш и TTL"]
    replay["replay.ts<br/>фикстуры"]
  end

  subgraph core["L0 чистое ядро"]
    dates["dates.ts"]
    selection["selection.ts"]
    feasibility["feasibility.ts"]
    pricing["pricing.ts"]
    hotels["hotels.ts"]
    packages["packages.ts"]
    labels["checkout-labels.ts"]
  end

  web --> build
  web --> checkout
  mcp --> build
  mcp --> checkout
  web --> tripid
  mcp --> tripid

  build --> confcal
  build --> tutu
  build --> geo
  build --> cal
  build --> weather
  build --> core
  checkout --> tutu
  checkout --> labels

  confcal --> normalize
  tutu --> normalize
  confcal --> cache
  tutu --> cache
  cache --> replay

  normalize --> core
```

Зависимости идут только вниз. Ни один модуль L0 не знает про сеть, часы и формат ответов
источников; ни один модуль L4 не считает даты и цены. Именно поэтому чистое ядро проверяется
юнит-тестами без единого мока.

## Сборка поездки

Что происходит, когда человек открывает экран или агент зовёт `find_event_trips`.

```mermaid
sequenceDiagram
  participant U as Человек или агент
  participant W as L4 экран или MCP
  participant B as L3 build-trip
  participant C as confcal
  participant T as Tutu
  participant E as L2 обогащение
  participant K as L0 ядро

  U->>W: тема, город отправления
  W->>B: TripRequest
  B->>C: список городов, поиск событий
  C-->>B: события и охват каталога
  B->>K: отбор событий (онлайн, свой город, окно дат)
  K-->>B: одно событие и до пяти запасных
  B->>K: даты проживания
  K-->>B: заезд, выезд, число ночей
  par транспорт и отели
    B->>T: поиск дорог туда и обратно
    T-->>B: варианты по видам транспорта
  and
    B->>T: поиск отелей на эти даты
    T-->>B: предложения с ценой за всё проживание
  end
  B->>E: координаты площадки, пешая доступность, погода, рабочие дни
  E-->>B: то, что успело ответить
  B->>K: выполнимость, цена, ранжирование отелей, три правила
  K-->>B: до трёх пакетов
  B-->>W: TripResult
  W-->>U: экран или structuredContent
```

Обогащение никогда не ломает сборку. Каждый источник L2 живёт со своим таймаутом, а его отказ
превращается в отсутствующий блок и строку про то, какой именно источник не ответил.

## Оплата

Ссылки собираются в момент нажатия, а не при сборке поездки: `checkout_ref` и `search_id`
живут недолго.

```mermaid
sequenceDiagram
  participant U as Человек или агент
  participant W as L4 экран или MCP
  participant B as L3 build-checkout
  participant T as Tutu
  participant K as L0 checkout-labels

  U->>W: собрать ссылки на оплату
  W->>B: выбранный вариант
  B->>T: детали номера, если в пакете есть отель
  T-->>B: offerpack_hash
  B->>T: create_checkout_link на каждую часть
  T-->>B: ссылка и её kind
  B->>K: подпись по фактическому kind
  K-->>B: текст кнопки и оговорка
  B-->>W: чек-лист из двух-трёх ссылок
  W-->>U: кнопки с честными подписями
```

Если живой вызов не удался, Заезд отдаёт страницу поиска Туту и подписывает кнопку именно так.
Корзину заводит сам человек в своей сессии: это модель Туту, а не деталь реализации.

## Два канала, один рендерер

Экран и MCP App рисует один и тот же код в `src/web/client/`. Отличается только то, откуда
приходят данные и кто имеет право действовать.

| | Экран в браузере | MCP App в хосте |
|---|---|---|
| Данные | встроены сервером в документ | приходят от хоста в `ui/notifications/tool-result` |
| Пересборка | форма на своём origin | `tools/call` через хост |
| Открытие ссылки | обычная ссылка | `ui/open-link` через хост |
| Тема | системная настройка | то, что сообщил хост |

Внутри хоста страница живёт в песочном iframe под строгим CSP и своего origin не имеет.
Поэтому статика отдаётся с `Access-Control-Allow-Origin: *`, иначе модульный скрипт не
загрузится и доска останется пустой при полностью рабочем вебе.

## Состояние

Состояния поездки на сервере нет. `trip_id` - это компактная запись самого запроса
(`v1.` плюс base64url канонического JSON), поэтому `/t/:id` пересобирает поездку из ссылки, а
перезапуск сервера ничего не стоит ни человеку, ни агенту.

Кэш живёт в памяти процесса, у каждого источника свой TTL. Ссылки на оплату не кэшируются
никогда.
