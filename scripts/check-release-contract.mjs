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

if (packageJson.version !== '1.0.0') {
  fail('P34 stable release metadata requires package.json version 1.0.0.');
}

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
  'e2e:p34',
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
if (
  scripts['e2e:p34'] &&
  !/p34-post-v1-final-hardening-certification\.spec\.ts/u.test(scripts['e2e:p34'])
) {
  fail('e2e:p34 must target the dedicated P34 final-certification spec.');
}
if (scripts['e2e:p34'] && !/--retries=0/u.test(scripts['e2e:p34'])) {
  fail('e2e:p34 must run with retries disabled so terminal certification cannot hide flakes.');
}

const certify = scripts['release:certify'] ?? '';
for (const gate of [
  'release:check',
  'e2e:compat',
  'e2e:release',
  'e2e:p20',
  'e2e:p34',
  'e2e:pwa',
]) {
  if (!certify.includes(`npm run ${gate}`)) {
    fail(`release:certify must include npm run ${gate}.`);
  }
}

const requiredFiles = [
  'docs/P18_PERFORMANCE_LARGE_LIBRARY_SCALE.md',
  'docs/P19_ACCESSIBILITY_INTERACTION_QUALITY.md',
  'docs/P20_RELEASE_CERTIFICATION.md',
  'docs/P34_POST_V1_FINAL_HARDENING_CERTIFICATION.md',
  'docs/INTERACTION_ACCESSIBILITY.md',
  'docs/BACKUP.md',
  'docs/KEYBOARD.md',
  'e2e/p18-performance-large-library-scale.spec.ts',
  'e2e/p19-accessibility-interaction-quality.spec.ts',
  'e2e/p20-release-certification.spec.ts',
  'e2e/p34-post-v1-final-hardening-certification.spec.ts',
  'playwright.compat.config.ts',
  'playwright.pwa.config.ts',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
];
for (const file of requiredFiles) {
  if (!exists(file)) fail(`${file} is required by the final release contract.`);
}

const ci = read('.github/workflows/ci.yml');
for (const command of [
  'npm run release:contract',
  'npm run e2e:release',
  'npm run e2e:p20',
  'npm run e2e:p34',
]) {
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
  'needs: deploy',
  'https://thiepn.dev/notes/',
  'manifest.webmanifest',
  'sw.js',
  'curl --fail --silent --show-error --location',
  'name: stable release marker',
  'Release v1.0.0',
  'package_version',
  'test "$package_version" = "1.0.0"',
  'P34 post-v1 final hardening and certification complete.',
  'gh release create v1.0.0',
  'test "$tag_sha" = "$RELEASE_SHA"',
]) {
  if (!deploy.includes(deploymentInvariant)) {
    fail(`Pages deployment must preserve certified release invariant: ${deploymentInvariant}`);
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

const p34Doc = exists('docs/P34_POST_V1_FINAL_HARDENING_CERTIFICATION.md')
  ? read('docs/P34_POST_V1_FINAL_HARDENING_CERTIFICATION.md')
  : '';
for (const heading of [
  '# P34 — Post-V1 Final Hardening & Certification',
  '## Terminal scope',
  '## Permanent release gates',
  '## Stable release publication',
  '## Known limitations',
  '## Stop condition',
]) {
  if (!p34Doc.includes(heading)) fail(`P34 documentation must include ${heading}.`);
}

for (const file of collectTestFiles()) {
  const source = read(file);
  const forbiddenMarkers = [
    {
      pattern: /\b(?:test|it|describe)(?:\.describe)?\.(?:only|skip|fixme)\s*\(/u,
      label: 'focused/skipped/fixme test marker',
    },
  ];
  for (const marker of forbiddenMarkers) {
    if (marker.pattern.test(source)) {
      fail(`${file} contains a forbidden ${marker.label}.`);
    }
  }
}

if (failures.length) {
  for (const message of failures) console.error(`[release-contract] ${message}`);
  process.exit(1);
}

console.log('[release-contract] P34 final release contract passed.');

function collectTestFiles() {
  const roots = ['e2e', 'compat-e2e', 'pwa-e2e', 'src'];
  const files = [];
  for (const directory of roots) walk(directory, files);
  return files.filter((file) => /(?:\.spec|\.test)\.[cm]?[jt]sx?$/u.test(file));
}

function walk(relativeDirectory, files) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return;
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'));
    }
  }
}
