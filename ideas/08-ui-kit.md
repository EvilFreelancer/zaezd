# UI-kit Туту, дизайн-система Kite

Организаторы UI-kit не обещали. Но он и не нужен, потому что боевая дизайн-система Туту лежит в открытом доступе на их CDN прямо сейчас. Найдена по цепочке от иконок MCP-ресурсов, где светился путь `cdn1.tu-tu.ru/lib-assets/@tutu-react/favicon@1.3.2/`, а оттуда по подключениям главной страницы `tutu.ru`.

## Что это и где лежит

Система называется Kite, актуальная версия на 19 августа 2026 года - 5.10.0. Публикуется как набор CSS-файлов, без регистрации и без ключа.

| Файл | Размер | Что внутри |
|---|---|---|
| `index.css` | 384 КБ | все примитивы и значения токенов, включая темы |
| `css-vars-mapping.css` | 104 КБ | карта семантических имён `--kite-*` в захэшированные примитивы |
| `media-minWidth576.css` | 86 КБ | брейкпоинт sm |
| `media-minWidth768.css` | 86 КБ | брейкпоинт md |
| `media-minWidth992.css` | 86 КБ | брейкпоинт lg |
| `media-minWidth1200.css` | 86 КБ | брейкпоинт xl |
| `media-minWidth1400.css` | 86 КБ | брейкпоинт xxl |
| `theme-switcher.js` | 2 КБ | переключатель тем |

База адресов такая.

```
https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/<файл>
```

Подключение ровно в том порядке, в каком его подключает сама `tutu.ru`.

```html
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/index.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/css-vars-mapping.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/media-minWidth576.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/media-minWidth768.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/media-minWidth992.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/media-minWidth1200.css">
<link rel="stylesheet" href="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/media-minWidth1400.css">
<script src="https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/theme-switcher.js"></script>
```

Важная оговорка. Это только токены и стили. Библиотеки React-компонентов в открытом доступе нет, пакет `@tutu/kite` и `@tutu-react` на npm отсутствуют, а листинг каталога на CDN отдаёт 404. Значит вёрстку компонентов пишете сами, но цвета, отступы, радиусы, тени и типографика достаются готовыми и совпадают с настоящим Туту до пикселя.

## Устройство токенов

Двухслойная схема. В `index.css` лежат примитивы с обфусцированными именами вроде `--k6f99`, а `css-vars-mapping.css` даёт им человеческие имена вида `--kite-button-general-background-primary-default`.

```css
/* css-vars-mapping.css */
--kite-attachment-file-background-default: var(--k96c9);
/* index.css */
--k96c9: #f5f5f9;
```

Всего разрешается 1726 семантических токенов. Из них 529 меняются при переключении темы.

Компонентные группы, отсортированные по числу токенов.

| Группа | Токенов | Группа | Токенов |
|---|---|---|---|
| button | 393 | badge | 48 |
| calendar | 166 | cell | 41 |
| chip | 146 | attachment | 27 |
| modal | 141 | tab и tabs | 47 |
| label | 124 | header | 23 |
| segmented | 67 | selection | 22 |
| rich | 64 | pagination | 20 |
| input | 61 | panel | 20 |
| gallery | 49 | steps | 19 |

Календарь на 166 токенов и галерея на 49 - это ровно то, что нужно тревел-интерфейсу, и обе группы готовы к использованию.

## Темы

Атрибут `data-theme` на корневом элементе с тремя значениями, `light`, `dark`, `inverted`. Переключатель хранит выбор в `localStorage` под ключом `tutu-kite-theme` и умеет ещё `data-style` и `data-contrast=high` для повышенной контрастности.

Селекторы в Kite перечисляют вложенные темы, поэтому блок тёмной темы выглядит как `[data-theme=dark], [data-theme=light] [data-theme=inverted] ...`. Разбирать их подстрокой нельзя, надо сравнивать элементы селектора точно, иначе светлая тема наберёт значения тёмной.

## Ядро палитры

Разрешено из Kite. Фиолетовый бренда одинаков в обеих темах, меняются поверхности и текст.

| Роль | Светлая | Тёмная |
|---|---|---|
| Бренд | `#6f5df6` | `#6f5df6` |
| Бренд нажатый | `#654eef` | `#654eef` |
| Бренд светлый | `#8b87ff` | `#8b87ff` |
| Акцент | `#f76b3b` | `#f76b3b` |
| Предупреждение | `#ffdd3e` | `#ffdd3e` |
| Поверхность | `#ffffff` | `#1a1e2d` |
| Поверхность приглушённая | `#f5f5f9` | `#212537` |
| Поверхность приподнятая | - | `#292c40` |
| Текст | `#181c2d` | `#f5f5f9` |
| Текст вторичный | `#555a7a` | `rgba(245,245,249,.6)` |
| Текст третичный | `#7d82a0` | `#707495` |
| Граница | `rgba(112,116,149,.15)` | `rgba(112,116,149,.15)` |

Отдельно палитра презентации открытия хакатона, снятая с самих слайдов. Она ярче продуктовой, потому что рассчитана на проектор.

| Роль | HEX |
|---|---|
| Фиолетовый слайдов | `#816dff` |
| Оранжевый | `#fd5623` |
| Лаймовый | `#d1ff11` |
| Тёмно-синий | `#0d0b68` |
| Лаванда фона | `#efecff` |

Брейкпоинты Kite стандартные, 576, 768, 992, 1200 и 1400 пикселей.

## Готовые файлы

В папке [ui-kit](ui-kit/) лежат два артефакта.

- `kite-tokens.json` - все 1726 семантических токенов, разрешённые до конечных значений, отдельно для светлой и тёмной темы. 208 КБ;
- `tutu-core.css` - выжимка на пару десятков переменных `--tutu-*` для быстрой вёрстки, со светлой и тёмной темой и брейкпоинтами.

Быстрый старт без подключения всей системы.

```html
<link rel="stylesheet" href="ideas/ui-kit/tutu-core.css">
<style>
  .card {
    background: var(--tutu-surface);
    color: var(--tutu-text);
    border: 1px solid var(--tutu-border);
    border-radius: 12px;
  }
  .price { color: var(--tutu-brand); font-weight: 600; }
  .btn { background: var(--tutu-brand); color: #fff; }
  .btn:active { background: var(--tutu-brand-pressed); }
</style>
```

Найти конкретный токен в полном наборе можно так.

```bash
python3 -c "
import json
t=json.load(open('ideas/ui-kit/kite-tokens.json'))['light']
for k,v in t.items():
    if 'calendar' in k and 'background' in k: print(k, v)
"
```

## Зачем это на хакатоне

Качество UX/UI стоит двадцать баллов, больше любого другого критерия. Интерфейс, попадающий в фирменные цвета Туту, судьи считывают за секунду, и это работает без единого слова объяснений. Плюс тёмная тема из коробки, что при семидесяти одной команде вокруг само по себе выделяет.

Оговорка про надёжность. CDN чужой, и на демо он может подвести или отдать другую версию. Файлы стоит скачать и положить в свой репозиторий, а не подключать по сети. Организаторы предупредили, что нерабочая ссылка означает незачёт материала, и зависимость демо от чужого CDN - ровно такой риск.

```bash
mkdir -p vendor/kite
for f in index.css css-vars-mapping.css media-minWidth576.css media-minWidth768.css \
         media-minWidth992.css media-minWidth1200.css media-minWidth1400.css theme-switcher.js; do
  curl -sS -o "vendor/kite/$f" "https://cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/$f"
done
```
