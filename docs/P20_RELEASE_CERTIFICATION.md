# P20 — Release Certification

## Goal

P20 is the final release-qualification phase for the current Notes product. It adds no new product architecture. Its job is to make the existing P1–P19 contracts permanent release blockers and to add cross-system tests that fail when individually-correct features stop composing safely.

The governing rule is: **attempt to disprove release readiness, fix real release blockers, and never weaken an older contract to make certification green.**

## Authoritative baseline

- Repository: `thiepn/notes`
- P19 production/main baseline: `47aa4a639a65040ea88cef5ba285981d56b4f927`
- Baseline phase: P19 — Accessibility & Interaction Quality
- Baseline automated evidence reported by P19: 228 unit tests, 222 Chromium E2E tests, 6 compatibility tests, 8 PWA/offline tests
- Baseline production entry reported by P19: 480.0 KiB raw / 142.8 KiB gzip
- Production target: `https://thiepn.dev/notes/`

The release-candidate SHA must be the exact PR head that passes the full gate. The production SHA must be recorded separately after merge/deployment; an older green SHA is not release evidence for a newer candidate.

## Release severity policy

### Blocker

Data loss/corruption, unsafe restore/migration, silent overwrite, unrecoverable common-path editor state, application startup failure, production offline/PWA failure, or an equivalent defect that invalidates the product's core trust model.

P20 may not close with an unresolved blocker.

### High

A major shipped workflow is unusable, a common keyboard/touch path is trapped, destructive behavior is unsafe, sync/conflict handling loses a legitimate version, or a repeatable runtime failure prevents normal use.

P20 may not close with an unresolved high-severity defect.

### Medium / Low

Recoverable UX, copy, visual, or edge-case defects may be deferred only when they are documented and fixing them during certification would create disproportionate regression risk.

Severity may not be redefined merely to pass the release.

## Permanent automated gates

The release chain is intentionally composed from existing permanent tests rather than replacing them with one new superficial suite.

`npm run release:check` requires:

1. Prettier formatting
2. P1 foundation contract
3. P20 release contract
4. ESLint / React Compiler rules
5. complete Vitest unit suite
6. TypeScript through the production build
7. production build and performance budget

Browser certification remains:

1. `npm run e2e:compat` — focused Chromium/Firefox/WebKit compatibility
2. `npm run e2e` — complete Chromium product regression suite, including P1–P20 phase tests
3. `npm run e2e:p20` — P20 cross-system tests with **retries disabled**
4. `npm run e2e:pwa` — production-build PWA/offline certification

The single orchestration command is:

```text
npm run release:certify
```

CI also runs the P20 release contract and no-retry P20 browser suite as permanent explicit gates so future changes cannot silently remove them.

## P20 cross-system browser scenarios

`e2e/p20-release-certification.spec.ts` intentionally tests composition rather than repeating feature-level suites.

### Integrated note lifecycle

```text
capture text note
→ assign label
→ change color
→ schedule reminder
→ archive
→ verify organization/reminder state in Archive
→ unarchive
→ verify note returns intact
```

### Semantic full-library recovery

```text
create text + checklist + label + reminder + attachment
→ exact full backup
→ replace local data
→ restore
→ verify relationships and bytes
→ reload
→ immediately retrieve restored note through normal local search
```

### Keyboard-only release journey

```text
C capture
→ write
→ keyboard close
→ J/P/# organization shortcuts
→ archive with keyboard
→ Ctrl+K navigation
→ reopen archived note with keyboard
```

### Small-mobile release journey

At 320 × 568:

```text
mobile New
→ template capture
→ edit/close
→ More navigation
→ Settings
→ verify no page-level horizontal overflow
```

These scenarios complement the existing dedicated suites for backup rollback, import, history, reminders/timezones, privacy, sync/conflict safety, multi-tab recovery, large-library scale, OCR, attachments/media, responsive navigation, PWA/offline behavior, P18 performance, and P19 accessibility/focus behavior.

## Preserved architecture boundaries

P20 does not intentionally change:

- IndexedDB schema/version or durable record formats;
- note/checklist autosave semantics;
- revision/history authority;
- search index format/ranking;
- WikiLink semantics;
- reminder persistence/scheduling model;
- backup format;
- Google Keep import format;
- portable-export format;
- Supabase schema/RLS/auth or reconciliation format;
- conflict-copy semantics;
- multi-tab invalidation/recovery journals;
- privacy-lock threat model or storage;
- PWA share-target transport;
- OCR architecture/assets;
- product navigation or visual design system.

A change to one of these boundaries discovered to be necessary during P20 requires explicit evidence and dedicated regression coverage.

## Release evidence inventory

The permanent suite already contains dedicated browser coverage for:

- database/migrations and persistence;
- capture and checklists;
- cards, pin/color/labels, bulk selection, Archive and Trash;
- reminders and timezone behavior;
- search, saved/recent search, commands, WikiLinks, backlinks and local intelligence;
- attachments, drawing, voice and OCR;
- revisions/history;
- exact backup/atomic restore, portable export and Google Keep import;
- privacy and device trust;
- account/sync/conflict safety;
- multi-tab stale-write protection and recovery journals;
- large-library performance/storage hardening;
- responsive shell/mobile usability;
- accessibility, focus, reduced motion and forced colors;
- production PWA/offline/share-target behavior.

P20 does not claim that automated coverage proves subjective usability, perfect accessibility, or absence of all defects.

## Manual acceptance matrix

| Domain                             | Automated evidence                                 | Manual acceptance before stable release                        |
| ---------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Data integrity / migrations        | Required                                           | Inspect representative upgrade and failure recovery            |
| Text notes / editor                | Required                                           | Natural writing/edit/reload session                            |
| Checklists                         | Required                                           | Natural list editing/toggling session                          |
| Capture                            | Required                                           | Desktop and mobile capture sources                             |
| Attachments / OCR / media          | Required                                           | Browser capability and failure-state sanity check              |
| Organization / lifecycle           | Required                                           | Pin/label/color/archive/trash recovery journey                 |
| Search / commands / connections    | Required                                           | Retrieval of old and newly-mutated content                     |
| Reminders                          | Required                                           | Scheduling, overdue/completed presentation                     |
| History                            | Required                                           | Restore an older revision and continue editing                 |
| Backup / restore / import / export | Required                                           | Inspect exported artifact and perform clean restore            |
| Multi-tab / recovery               | Required                                           | Two-tab concurrent edit session                                |
| Sync / conflicts                   | Required when remote test environment is available | Offline/reconnect/conflict sanity check                        |
| Privacy                            | Required                                           | Lock/reload/unlock and hidden-preview inspection               |
| Accessibility                      | Required                                           | Keyboard-only pass; screen-reader/AT review remains human work |
| Responsive / mobile                | Required                                           | 320/390 mobile and tablet/desktop spot checks                  |
| Performance                        | Required                                           | Large-library interaction sanity check                         |
| Offline / PWA                      | Required                                           | Installed/production offline reload                            |
| Production                         | Required                                           | Live deployed smoke after exact main SHA deploys               |

Manual acceptance must be recorded separately from automated PASS claims.

## Known limitations

These are product boundaries, not hidden release claims:

- Notes is local-first browser software; durability ultimately depends on the user's browser profile/storage and backups.
- The device privacy lock reduces accidental exposure but is **not encryption at rest** and does not protect against an attacker controlling the browser profile/developer tools.
- Browser notifications are best-effort; Notes does not claim reliable server-push reminder delivery while every app/tab instance is closed.
- Media recording, clipboard access, notifications, and similar browser APIs vary by browser, permissions, and secure-context support.
- OCR quality is bounded by Tesseract/browser input quality and the bundled language set; no hosted AI correction is implied.
- Optional cloud synchronization requires its configured provider/network and does not replace local backup.
- Automated accessibility checks and keyboard tests are not a claim of complete WCAG conformance.

## Release decision

**PENDING CERTIFICATION.**

P20 may change this decision only after the exact release-candidate head passes all permanent gates with zero unresolved Blocker/High defects, the merged `main` commit is recertified, and production smoke is recorded.

The final report must record:

```text
Baseline SHA
Release candidate SHA
Merged main SHA
Deployed production SHA
Unit result
Compatibility result
Chromium E2E result
P20 no-retry result
PWA/offline result
Production bundle/performance result
Blocker count
High-severity count
Known deferred findings
Release decision
```
