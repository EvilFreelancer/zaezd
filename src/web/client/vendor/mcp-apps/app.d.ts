/**
 * Types for the vendored MCP Apps bundle.
 *
 * The runtime file is `src/web/public/vendor/mcp-apps/app.js`, copied from the package's own
 * pre-bundled browser build so the page loads without a bundler and without a CDN. The types
 * come from the installed package, so this declaration cannot drift from what ships.
 */
export { App } from '@modelcontextprotocol/ext-apps';
export type { McpUiToolResultNotification } from '@modelcontextprotocol/ext-apps';
