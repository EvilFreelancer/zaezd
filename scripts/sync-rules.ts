/**
 * Rules Sync, mechanised.
 *
 * The `workflow` rule makes it mandatory to mirror every rule edit into every other agent's
 * tree in the same commit. Doing that by hand drifts, so `.claude/rules/*.md` is the single
 * source of truth and `.cursor/rules/*.mdc` is generated from it.
 *
 * Two differences are translated, and only two: the frontmatter dialect, and the way a rule
 * references a sibling rule.
 *
 *   npm run rules:sync    rewrite the Cursor tree
 *   npm run rules:check   fail if the Cursor tree is stale (runs inside npm run verify)
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDE_DIR = '.claude/rules';
const CURSOR_DIR = '.cursor/rules';

type Rule = {
  readonly name: string;
  readonly description: string;
  readonly paths: readonly string[];
  readonly body: string;
};

function parseClaudeRule(name: string, raw: string): Rule {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match?.[1]) {
    throw new Error(`${name}: missing frontmatter`);
  }
  const frontmatter = match[1];
  const body = raw.slice(match[0].length);

  const description = /^description:\s*"(.*)"\s*$/m.exec(frontmatter)?.[1];
  if (description === undefined) {
    throw new Error(`${name}: frontmatter has no quoted description`);
  }

  const paths = frontmatter.includes('paths:')
    ? [...frontmatter.matchAll(/^\s*-\s*"(.+)"\s*$/gm)].map((m) => m[1] as string)
    : [];

  return { name, description, paths, body };
}

function renderCursorRule(rule: Rule): string {
  const frontmatter =
    rule.paths.length > 0
      ? `description: "${rule.description}"\nglobs: ${rule.paths.join(',')}\nalwaysApply: false`
      : `description: "${rule.description}"\nalwaysApply: true`;

  // A Claude rule points at `.claude/rules/<topic>.md`; a Cursor rule points at `@<topic>.mdc`.
  const body = rule.body.replace(/`\.claude\/rules\/([a-z-]+)\.md`/g, '@$1.mdc');

  return `---\n${frontmatter}\n---\n\n${body}`;
}

function readRules(): readonly Rule[] {
  return readdirSync(CLAUDE_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.slice(0, -'.md'.length);
      return parseClaudeRule(name, readFileSync(join(CLAUDE_DIR, file), 'utf8'));
    });
}

function main(): void {
  const check = process.argv.includes('--check');
  const stale: string[] = [];

  for (const rule of readRules()) {
    const target = join(CURSOR_DIR, `${rule.name}.mdc`);
    const wanted = renderCursorRule(rule);
    let current: string | undefined;
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      current = undefined;
    }
    if (current === wanted) continue;

    if (check) {
      stale.push(target);
    } else {
      writeFileSync(target, wanted);
      console.warn(`synced ${target}`);
    }
  }

  const known = new Set(readRules().map((rule) => `${rule.name}.mdc`));
  for (const file of readdirSync(CURSOR_DIR)) {
    if (file.endsWith('.mdc') && !known.has(file)) {
      stale.push(join(CURSOR_DIR, `${file} (no counterpart in ${CLAUDE_DIR})`));
    }
  }

  if (stale.length > 0) {
    console.error('Rule trees are out of sync:');
    for (const file of stale) console.error(`  ${file}`);
    console.error('Run `npm run rules:sync` and commit both trees together.');
    process.exit(1);
  }

  console.warn(check ? 'rule trees are in sync' : 'rule trees synced');
}

main();
