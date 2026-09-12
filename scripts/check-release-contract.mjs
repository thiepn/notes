/* global console, process */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts ?? {};

const requiredScripts = [
  'format:check',
  'foundation:check',
  'release:contract',
  'lint',
  'typecheck',
  'test',
  'build',
  'e2e',
  'e2e:release',
  'e2e:compat',
  'e2e:p20',
  'e2e:pwa',
  'release:check',
  'release:certify',
];

for (const name of requiredScripts) {
  if (typeof scripts[name] !== 'string' || scripts[name].trim() === '') {
    fail(`package.json must define a non-empty ${name} script.`);
  }
}

if (scripts['e2e:release'] && !/--retries=0/u.test(scripts['e2e:release'])) {
  fail('e2e:release must run the complete browser regression suite with retries disabled.');
}
if (scripts['e2e:p20'] && !/p20-release-certification\.spec\.ts/u.test(scripts['e2e:p20'])) {
  fail('e2e:p20 must target the dedicated P20 release-certification spec.');
}
if (scripts['e2e:p20'] && !/--retries=0/u.test(scripts['e2e:p20'])) {
  fail('e2e:p20 must run with retries disabled so release flakes cannot be hidden.');
}

const certify = scripts['release:certify'] ?? '';
for (const gate of ['release:check', 'e2e:compat', 'e2e:release', 'e2e:p20', 'e2e:pwa']) {
  if (!certify.includes(`npm run ${gate}`)) {
    fail(`release:certify must include npm run ${gate}.`);
  }
}

const requiredFiles = [
  'docs/P18_PERFORMANCE_LARGE_LIBRARY_SCALE.md',
  'docs/P19_ACCESSIBILITY_INTERACTION_QUALITY.md',
  'docs/P20_RELEASE_CERTIFICATION.md',
  'docs/INTERACTION_ACCESSIBILITY.md',
  'docs/BACKUP.md',
  'docs/KEYBOARD.md',
  'e2e/p18-performance-large-library-scale.spec.ts',
  'e2e/p19-accessibility-interaction-quality.spec.ts',
  'e2e/p20-release-certification.spec.ts',
  'playwright.compat.config.ts',
  'playwright.pwa.config.ts',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
];
for (const file of requiredFiles) {
  if (!exists(file)) fail(`${file} is required by the P20 release contract.`);
}

const ci = read('.github/workflows/ci.yml');
for (const command of ['npm run release:contract', 'npm run e2e:release', 'npm run e2e:p20']) {
  if (!ci.includes(command)) fail(`CI must permanently run ${command}.`);
}

const deploy = read('.github/workflows/deploy.yml');
for (const deploymentInvariant of [
  'workflow_run:',
  'workflows: [CI]',
  'branches: [main]',
  "github.event.workflow_run.conclusion == 'success'",
  'ref: ${{ github.event.workflow_run.head_sha }}',
  'git rev-parse HEAD',
  'github.event.workflow_run.head_sha',
  'npm ci --no-audit --no-fund',
]) {
  if (!deploy.includes(deploymentInvariant)) {
    fail(`Pages deployment must preserve certified-main invariant: ${deploymentInvariant}`);
  }
}
if (/^\s*push:\s*$/mu.test(deploy)) {
  fail('Pages deployment must not race main CI through an independent push trigger.');
}

const p20Doc = exists('docs/P20_RELEASE_CERTIFICATION.md')
  ? read('docs/P20_RELEASE_CERTIFICATION.md')
  : '';
for (const heading of [
  '# P20 — Release Certification',
  '## Authoritative baseline',
  '## Release severity policy',
  '## Permanent automated gates',
  '## Manual acceptance matrix',
  '## Known limitations',
  '## Release decision',
]) {
  if (!p20Doc.includes(heading)) fail(`P20 documentation must include ${heading}.`);
}

if (failures.length) {
  for (const message of failures) console.error(`[release-contract] ${message}`);
  process.exit(1);
}

console.log('[release-contract] P20 release contract passed.');
