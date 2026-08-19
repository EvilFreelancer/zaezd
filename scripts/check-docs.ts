/**
 * The commands the documentation names must exist.
 *
 * A `npm run` that appears in the brief or the README and not in `package.json` is the exact
 * defect this repository is graded on, and it is the kind a person never notices twice. So it
 * is checked by a script rather than by intention, and the script runs inside `npm run verify`.
 */
import { readFileSync } from 'node:fs';

const DOCUMENTS = ['AGENTS.md', 'README.md', 'docs/user-guide.md', 'docs/architecture.md'];

const scripts = new Set(
  Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: object }).scripts),
);

/**
 * Only commands written as code, in a fence or in backticks.
 *
 * Prose mentions commands the way prose does - "every npm run named in the docs" - and matching
 * that turns the check into a nuisance that gets deleted.
 */
function commandsIn(text: string): readonly string[] {
  const fences = [...text.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
  const inline = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '');

  return [...fences, ...inline]
    .flatMap((chunk) => [...chunk.matchAll(/npm run ([a-z][a-z:-]*)/g)])
    .map((match) => match[1] as string);
}

const missing: string[] = [];
for (const document of DOCUMENTS) {
  for (const name of commandsIn(readFileSync(document, 'utf8'))) {
    if (!scripts.has(name)) missing.push(`${document}: npm run ${name}`);
  }
}

if (missing.length > 0) {
  console.error('These commands are documented and do not exist:');
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}

console.warn(`documented commands exist (${DOCUMENTS.length} files checked)`);
