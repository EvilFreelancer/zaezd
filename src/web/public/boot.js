/**
 * Runs before anything else on the page, in both channels.
 *
 * Two jobs at this stage. It tells the stylesheet that scripting is alive, so the text
 * fallback the server always renders can step aside for the interactive board - done in a
 * script rather than with `<noscript>` styling so the fallback survives a script that fails
 * to load, not only scripting that is switched off. And it follows the platform colour
 * scheme, because the vendored Kite extract keys its dark palette off `data-theme` and has
 * no media query of its own. Inside an MCP host this value is overwritten by the theme the
 * host reports at handshake.
 *
 * The renderer and the two data paths (embedded JSON for the web,
 * `ui/notifications/tool-result` for the MCP App) attach here as they are built.
 */
const root = document.documentElement;
root.dataset['js'] = 'on';

const dark = window.matchMedia('(prefers-color-scheme: dark)');

/** @param {boolean} isDark */
function applyTheme(isDark) {
  root.dataset['theme'] = isDark ? 'dark' : 'light';
}

applyTheme(dark.matches);
dark.addEventListener('change', (event) => applyTheme(event.matches));
