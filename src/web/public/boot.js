/**
 * What starts the board, in whichever channel it finds itself.
 *
 * On the web the `TripResult` is already in the document; in an MCP App it arrives from the
 * host after loading, because an App resource is fetched independently of the tool call. The
 * renderer is the same either way - that is the whole point of splitting them.
 */
import { renderTrip } from "./render.js";
import { drawMap, resizeMap } from "./map.js";
import { CHECKOUT_META_KEY, TRIP_META_KEY } from "./contract.js";
const channel = document.body.dataset['channel'] ?? 'web';
const root = document.documentElement;
root.dataset['js'] = 'on';
/**
 * The vendored Kite extract keys its dark palette off `data-theme` and has no media query of
 * its own, so the platform preference is applied here. Inside a host this is overwritten by
 * the theme the host reports.
 */
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = (isDark) => {
    root.dataset['theme'] = isDark ? 'dark' : 'light';
};
const followPlatform = (event) => applyTheme(event.matches);
applyTheme(dark.matches);
dark.addEventListener('change', followPlatform);
const board = document.getElementById('board');
let current;
let selectedId;
function show(trip) {
    current = trip;
    // A different trip has different variants; keeping the old choice would highlight a card
    // that is no longer on the board.
    if (!trip.packages.some((item) => item.variant.id === selectedId))
        selectedId = undefined;
    if (board !== null)
        renderTrip(board, trip, { onSelect: select });
    drawMap(trip, selectedId, select);
}
/** One line where the board would be. Used while waiting on a host and when one fails. */
function say(message) {
    if (board === null)
        return;
    board.replaceChildren();
    const line = document.createElement('p');
    line.className = 'waiting';
    line.textContent = message;
    board.append(line);
}
let tellTheModel;
function select(variantId) {
    selectedId = variantId;
    tellTheModel?.(variantId);
    for (const card of document.querySelectorAll('.card')) {
        const mine = card instanceof HTMLElement && card.dataset['variant'] === variantId;
        card.setAttribute('aria-pressed', mine ? 'true' : 'false');
        card.classList.toggle('card--chosen', mine);
    }
    drawMap(current, selectedId, select);
}
const embedded = document.getElementById('trip-data');
if (embedded !== null) {
    show(JSON.parse(embedded.textContent ?? '{}'));
}
/**
 * Who builds the payment links.
 *
 * On our own origin the page asks its own server. Inside a host the page has no origin to ask -
 * a strict policy forbids it - so it asks the host to call the tool, which is the same
 * `create_trip_checkout` an agent would call. Both paths end at the same builder.
 */
let buildCheckout = async (variantId) => {
    const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: current?.request, variantId }),
    });
    return (await response.json());
};
/** Who opens a link. In a host, the host: an iframe cannot navigate the top window. */
let openLink;
document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    // Inside a host the page cannot navigate anything: every outward link goes through the host,
    // not only the payment ones. A silently dead link on the event title reads as a broken widget.
    const anchor = target.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement && openLink !== undefined && /^https?:/.test(anchor.href)) {
        event.preventDefault();
        openLink(anchor.href);
        return;
    }
    const button = target.closest('.card__checkout');
    if (!(button instanceof HTMLButtonElement) || current === undefined)
        return;
    event.stopPropagation();
    button.disabled = true;
    button.textContent = 'Собираем ссылки…';
    try {
        button.replaceWith(checkoutList(await buildCheckout(button.dataset['variant'] ?? '')));
    }
    catch {
        button.disabled = false;
        button.textContent = 'Не получилось, попробовать ещё раз';
    }
});
function checkoutList(links) {
    const list = document.createElement('ul');
    list.className = 'checkout';
    for (const link of links) {
        const item = document.createElement('li');
        item.className = 'checkout__item';
        const anchor = document.createElement('a');
        anchor.className = `checkout__link${link.opensACart ? ' checkout__link--cart' : ''}`;
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = link.label;
        item.append(anchor);
        if (link.caveat !== undefined) {
            const note = document.createElement('span');
            note.className = 'checkout__caveat';
            note.textContent = link.caveat;
            item.append(note);
        }
        if (link.recorded === true) {
            const note = document.createElement('span');
            note.className = 'checkout__caveat';
            note.textContent = 'Ссылка из записи, скорее всего уже протухла';
            item.append(note);
        }
        list.append(item);
    }
    return list;
}
/**
 * The same board, inside an agent.
 *
 * The resource loads before the tool finishes, so the page starts empty and fills in when the
 * host forwards the result. The bridge is imported lazily and only here: a browser opening the
 * public link never downloads it.
 */
/**
 * The same board, inside an agent.
 *
 * The resource loads before the tool finishes, so the page starts on a waiting line and fills in
 * when the host forwards the result. The bridge is imported lazily and only here: a browser
 * opening the public link never downloads it.
 */
async function startInsideHost() {
    const { App } = await import('./vendor/mcp-apps/app.js');
    const app = new App({ name: 'zaezd-board', version: '0.1.0' });
    let tripId;
    const onResize = () => resizeMap();
    // Registered before connect, or the first result arrives with nobody listening.
    app.addEventListener('toolresult', (result) => {
        const trip = result._meta?.[TRIP_META_KEY];
        if (trip === undefined) {
            // Either the tool failed or it was the checkout, which draws no board. Only the first
            // deserves the board; a stale trip left on screen would be a lie about a failed call.
            if (result.isError === true) {
                current = undefined;
                tripId = undefined;
                say(textOf(result) ?? 'Поездка не собралась, попробуйте другой запрос.');
            }
            return;
        }
        show(trip);
        const shaped = result.structuredContent;
        tripId = typeof shaped?.trip_id === 'string' ? shaped.trip_id : undefined;
    });
    app.addEventListener('hostcontextchanged', (context) => {
        if (context.theme === 'dark' || context.theme === 'light')
            applyTheme(context.theme === 'dark');
        resizeMap();
    });
    app.onteardown = () => {
        window.removeEventListener('resize', onResize);
        return {};
    };
    buildCheckout = async (variantId) => {
        if (tripId === undefined)
            throw new Error('поездка ещё не пришла от хоста');
        const answer = await app.callServerTool({
            name: 'create_trip_checkout',
            arguments: { trip_id: tripId, package: variantId },
        });
        // A failing tool answers with a result, not with a rejection. Swallowing that would replace
        // the button with an empty list and tell nobody why.
        const links = answer._meta?.[CHECKOUT_META_KEY];
        if (answer.isError === true || links === undefined) {
            throw new Error(textOf(answer) ?? 'ссылки собрать не удалось');
        }
        return links;
    };
    openLink = (url) => void app.openLink({ url });
    tellTheModel = (variantId) => void app.updateModelContext({
        content: [{ type: 'text', text: `Человек выбрал на экране вариант ${variantId}.` }],
    });
    await app.connect();
    // The host decides the theme from here on; the platform preference would fight it.
    dark.removeEventListener('change', followPlatform);
    const theme = app.getHostContext()?.theme;
    if (theme === 'dark' || theme === 'light')
        applyTheme(theme === 'dark');
    // The container is sized by the host after the handshake, so the map is told to look again.
    resizeMap();
    window.addEventListener('resize', onResize);
}
/** The first line of text a tool answered with, when it answered with any. */
function textOf(result) {
    return result.content?.find((block) => block.type === 'text')?.text;
}
if (channel === 'app') {
    say('Ждём поездку от хоста…');
    startInsideHost().catch(() => say('Не удалось связаться с хостом, экран остался без поездки.'));
}
export { show, select };
//# sourceMappingURL=boot.js.map