# P34 — Post-V1 Final Hardening & Certification

## Terminal scope

P34 is the endpoint of the P21–P33 post-v1 refinement sequence.

It is not a feature phase and must not become another open-ended polish cycle. Its purpose is to audit the release machinery, close demonstrated release-critical inconsistencies, certify the complete product as one system, and publish the terminal P34 stable release only from the exact production commit that passed every permanent gate.

Authoritative baseline:

```text
P33 merged main: 6bc824e97479c815e5ba4ae8f4868f245b440281
Repository: thiepn/notes
Production: https://thiepn.dev/notes/
Existing historical stable release: v1.0.0
P34 stable release target: v1.0.1
```

P34 permits only:

- release-blocking bug fixes discovered by certification;
- release metadata alignment;
- test/CI/deployment hardening;
- final cross-system regression coverage;
- final release documentation and evidence.

P34 does not authorize new product features, redesigns, schema work, or another generic refinement roadmap.

## Audit findings

### Finding 1 — stable release metadata was not aligned

Before P34, the deployment workflow was already prepared to publish `v1.0.0`, while `package.json` still declared `0.0.0`.

P34 first aligned the application manifest with stable release metadata. Terminal publication then exposed an additional historical constraint: `v1.0.0` had already been published during P20 and points to its original certified release commit. P34 intentionally preserves that immutable release history rather than moving a published tag.

The terminal P34 release is therefore `v1.0.1`.

### Finding 2 — release publication evidence was stale

The stable release body still described the P20-era certification counts even though the product had subsequently passed P21–P33 and materially expanded its permanent regression suite.

P34 replaces those stale counts with durable gate descriptions and identifies P34 as the terminal certification phase. Release evidence remains tied to the exact deployed SHA rather than to historical counts copied into workflow text.

### Finding 3 — terminal certification was implicit

The complete `e2e:release` suite already includes every phase spec, but the release pipeline had no explicit P34 terminal gate.

P34 adds:

```text
npm run e2e:p34
```

with retries disabled, adds it to `release:certify`, and makes CI run it permanently after P20 certification.

### Finding 4 — skipped or focused tests could weaken future release evidence

P34 extends the release contract to reject committed `.only`, `.skip`, or `.fixme` markers in repository test/spec files.

This does not replace code review or complete coverage analysis. It prevents a simple class of accidental release-gate bypass from silently reaching a certified candidate.

### Finding 5 — stable release tags must remain immutable

The first P34 publication attempt correctly refused to overwrite the existing `v1.0.0` tag because it points to the earlier P20 release SHA.

P34 hardens the publication workflow so it derives the tag from the certified commit's `package.json` version. A marked release commit must have the exact subject `Release v<package-version>`. If that tag already exists, publication succeeds only when it already points to the exact certified production SHA; otherwise it fails instead of silently moving history.

## Permanent release gates

The terminal release command is:

```text
npm run release:certify
```

It requires, in order:

1. formatting;
2. foundation contract;
3. final release contract;
4. lint;
5. complete unit suite;
6. TypeScript and production build;
7. performance budget;
8. Chromium/Firefox/WebKit compatibility;
9. complete Chromium product regression with retries disabled;
10. focused P20 cross-system certification with retries disabled;
11. focused P34 terminal certification with retries disabled;
12. production-build PWA/offline certification.

CI mirrors these permanent gates. A focused P34 pass is not sufficient when the complete release suite is red.

## P34 browser certification

`e2e/p34-post-v1-final-hardening-certification.spec.ts` adds terminal composition checks rather than duplicating every feature suite.

The focused scenarios verify:

- stable release metadata and production PWA manifest invariants;
- a persisted note can survive reload, re-enter normal search, and continue through the final Settings/Privacy/Backup interaction chain without stale modal or focus state;
- a small-mobile top-level release journey can open Settings and return to the normal application shell without horizontal overflow or stranded modal state.

The complete no-retry suite remains authoritative for all domain-specific behavior.

## Stable release publication

Production deployment remains gated by successful `main` CI and builds the exact `workflow_run.head_sha`.

After deployment:

1. the live shell, manifest, and service worker must pass the production smoke job;
2. the stable release job checks the exact deployed commit;
3. it reads the application version from `package.json` and derives `release_tag=v<version>`;
4. only a commit whose subject is exactly `Release <release_tag>` is eligible to publish;
5. the release/tag is created against that exact SHA;
6. if that tag already exists, it must already resolve to that exact SHA or publication fails.

For terminal P34 publication the release commit title is:

```text
Release v1.0.1
```

The previously published `v1.0.0` release remains untouched at its original P20-certified SHA.

A normal later commit does not republish or move any stable tag.

## Architecture boundaries

P34 does not intentionally change:

- IndexedDB schema/version or durable record shapes;
- note/checklist editor persistence;
- revisions/history semantics;
- reminder scheduling semantics;
- search ranking/indexing;
- attachment/media payloads;
- backup/import/export formats;
- sync protocol, account API, reconciliation, or conflict preservation;
- privacy credential format, PBKDF2 parameters, or threat model;
- navigation information architecture or visual design system;
- PWA service-worker architecture or share-target protocol.

Any required change to one of those boundaries would need a demonstrated release blocker and dedicated regression evidence.

## Manual acceptance

Automation remains necessary but insufficient for subjective release quality.

Before treating the stable release as human-accepted, spot-check:

- natural text-note and checklist editing;
- representative desktop and small-mobile navigation;
- keyboard-only navigation and modal focus return;
- revision recovery;
- backup artifact inspection and clean restore;
- privacy lock/reload/unlock;
- offline installed-PWA reload;
- optional sync reconnect/conflict behavior when a configured remote environment is available;
- production deployment at the certified SHA.

Manual accessibility review is not replaced by automated keyboard tests and is not claimed as complete WCAG conformance.

## Known limitations

P34 preserves the existing documented product boundaries:

- browser storage and user backups remain part of the durability model;
- privacy lock is an application gate, not encryption at rest;
- local browser reminders are best-effort and are not guaranteed server-push delivery while all app instances are closed;
- media, clipboard, notification, and related browser APIs depend on platform capability and permission;
- OCR quality depends on input quality and the bundled Tesseract language data;
- optional cloud sync depends on its configured provider/network and does not replace backup;
- automated accessibility coverage does not prove complete accessibility conformance.

## Stop condition

P34 is complete only when:

```text
exact P34 v1.0.1 candidate head
→ complete CI green
→ merge as Release v1.0.1
→ merged main CI green
→ exact-SHA Pages deployment green
→ production smoke green
→ v1.0.1 release/tag resolves to the deployed main SHA
```

After that condition is satisfied:

**stop creating generic P35/P36 refinement phases.**

Future work must be driven by a concrete bug, a deliberately scoped new feature, a dependency/platform requirement, or a separately planned major/minor release—not by continuing the phase counter.
