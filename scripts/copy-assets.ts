/**
 * `tsc` emits JavaScript and nothing else, so a build made only of `tsc -p tsconfig.build.json`
 * produces a `dist/` with no HTML, no CSS, no vendored Leaflet and no Kite tokens. The server
 * would start and serve a blank page, which is exactly the kind of failure that only shows up
 * after deployment.
 *
 * This copies everything that is not TypeScript into the build output.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PAIRS: readonly (readonly [string, string])[] = [
  ['src/web/public', 'dist/web/public'],
  ['fixtures', 'dist/fixtures'],
];

function main(): void {
  for (const [from, to] of PAIRS) {
    if (!existsSync(from)) {
      console.warn(`skipped ${from}, it does not exist yet`);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.warn(`copied ${from} -> ${to}`);
  }

  const marker = join('dist', 'web', 'public');
  if (!existsSync(marker)) {
    console.error(`${marker} is missing after the copy step; the build would serve a blank page`);
    process.exit(1);
  }
}

main();
