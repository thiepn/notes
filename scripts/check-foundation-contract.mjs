import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const stylesDir = path.join(root, 'src/styles');
const cssFiles = fs.readdirSync(stylesDir).filter((name) => name.endsWith('.css')).sort();
const patchLayers = cssFiles.filter((name) => /(?:polish|final|fix)/i.test(name));
if (patchLayers.length) fail(`patch-layer styles are forbidden: ${patchLayers.join(', ')}`);

const entry = read('src/styles.css');
const imports = [...entry.matchAll(/@import ['"]\.\/styles\/([^'"]+)['"];?/g)].map((match) => match[1]);
if (imports[0] !== 'tokens.css') fail('tokens.css must be the first stylesheet import.');
if (imports[1] !== 'base.css') fail('base.css must be the second stylesheet import.');
if (new Set(imports).size !== imports.length) fail('src/styles.css contains duplicate stylesheet imports.');
for (const file of cssFiles) {
  if (imports.filter((name) => name === file).length !== 1) fail(`${file} must be imported exactly once.`);
}
for (const name of imports) if (!cssFiles.includes(name)) fail(`src/styles.css imports missing stylesheet ${name}.`);

const bannedStatusColors = ['#b42318', '#b3261e', '#c5221f', '#b54708', '#a15c00', '#14804a'];
for (const file of cssFiles) {
  if (file === 'tokens.css') continue;
  const content = read(`src/styles/${file}`).toLowerCase();
  for (const color of bannedStatusColors) if (content.includes(color)) fail(`${file} hard-codes shared semantic color ${color}; use a token.`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const sourceFiles = walk(path.join(root, 'src'));
for (const file of sourceFiles) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  if (relative === 'src/app/events.ts') continue;
  const content = fs.readFileSync(file, 'utf8');
  if (/['"]notes-(?:cloud-sync-applied|reminders-changed|open-sync-settings|search-history-changed)['"]/.test(content)) fail(`${relative} bypasses the application event contract.`);
}

const product = read('docs/PRODUCT.md');
if (!/optional private cloud synchronization/i.test(product)) fail('PRODUCT.md must describe shipped optional cloud sync.');
if (/Deliberate exclusions[\s\S]{0,800}- Cloud sync/i.test(product)) fail('PRODUCT.md still excludes shipped cloud sync.');
if (!fs.existsSync(path.join(root, 'docs/FOUNDATION.md'))) fail('docs/FOUNDATION.md is required.');

if (failures.length) {
  for (const message of failures) console.error(`[foundation] ${message}`);
  process.exit(1);
}
console.log(`[foundation] contract passed (${cssFiles.length} owned stylesheets, ${sourceFiles.length} TypeScript source files).`);
