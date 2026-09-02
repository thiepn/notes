from pathlib import Path

path = Path('scripts/v3-3-apply.py')
text = path.read_text()

# Replace the package.json patch with plain file text manipulation to avoid nested quoting.
start = text.index('# Add a hard performance budget to every production build.')
end = text.index('Path("scripts/check-performance-budget.mjs")', start)
replacement = r'''# Add a hard performance budget to every production build.
package_path = Path("package.json")
package_text = package_path.read_text()
package_old = '    "build": "npm run ocr:assets && npm run typecheck && vite build",\n'
package_new = (
    '    "build": "npm run ocr:assets && npm run typecheck && vite build && npm run perf:check",\n'
    '    "perf:check": "node scripts/check-performance-budget.mjs",\n'
)
if package_text.count(package_old) != 1:
    raise SystemExit("Could not patch package.json build script")
package_path.write_text(package_text.replace(package_old, package_new))

'''
text = text[:start] + replacement + text[end:]

# SearchWorkspace uses `editing`; wrap that ternary inside Suspense.
text = text.replace(
    'for path in ["src/features/search/SearchWorkspace.tsx", "src/features/reminders/RemindersWorkspace.tsx"]:',
    'for path in ["src/features/search/SearchWorkspace.tsx"]:',
)
text = text.replace(
    'text = text.replace(start, "      {editing ? (\\n        <Suspense fallback={<span className=\\"deferred-note-surface\\" role=\\"status\\">Opening note…</span>}>\\n", 1)',
    'text = text.replace(start, "      {editing ? (\\n        <Suspense fallback={<span className=\\"deferred-note-surface\\" role=\\"status\\">Opening note…</span>}>\\n          {", 1)',
)
text = text.replace(
    'text = text.replace("      ) : null}\\n\\n      {toast ? <LifecycleToast", "        </Suspense>\\n      ) : null}\\n\\n      {toast ? <LifecycleToast", 1)',
    'text = text.replace("      ) : null}\\n\\n      {toast ? <LifecycleToast", "          }\\n        </Suspense>\\n      ) : null}\\n\\n      {toast ? <LifecycleToast", 1)',
)

# ChecklistComposer uses attachmentNoteId rather than the text composer's activeNoteId.
checklist_start = text.index('# Checklist capture only needs attachments after the user opens that panel.')
checklist_end = text.index('# Search and reminder browsing should not drag full editors into their first-load chunks.', checklist_start)
checklist_section = text[checklist_start:checklist_end].replace('noteId={activeNoteId}', 'noteId={attachmentNoteId}')
text = text[:checklist_start] + checklist_section + text[checklist_end:]

# RemindersWorkspace uses editingNote/editingNoteId. Patch it explicitly with multiline literals.
insert_at = text.index('# PWA: OCR stays local')
reminder_patch = '''
# Reminder browsing also defers editor implementation until a reminder note is opened.
reminder_path = "src/features/reminders/RemindersWorkspace.tsx"
reminder_text = Path(reminder_path).read_text()
reminder_text = reminder_text.replace(
    "import { useCallback, useEffect, useMemo, useState } from 'react';",
    "import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';",
    1,
)
reminder_text = reminder_text.replace("import { ChecklistEditorDialog } from '../notes/ChecklistEditorDialog';\\n", "", 1)
reminder_text = reminder_text.replace("import { NoteEditorDialog } from '../notes/NoteEditorDialog';\\n", "", 1)
reminder_marker = "const attachmentsRepository = new AttachmentsRepository(notesDatabase);\\n"
if reminder_marker not in reminder_text:
    raise SystemExit("Missing reminders attachments repository marker")
reminder_lazy = """const ChecklistEditorDialog = lazy(() =>
  import('../notes/ChecklistEditorDialog').then((module) => ({ default: module.ChecklistEditorDialog })),
);
const NoteEditorDialog = lazy(() =>
  import('../notes/NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),
);
"""
reminder_text = reminder_text.replace(reminder_marker, reminder_marker + reminder_lazy, 1)
reminder_old = """      {editingNote ? (
        editingNote.type === 'checklist' ? (
"""
reminder_new = """      {editingNote ? (
        <Suspense fallback={<span className="deferred-note-surface" role="status">Opening note…</span>}>
          {editingNote.type === 'checklist' ? (
"""
if reminder_old not in reminder_text:
    raise SystemExit("Missing reminder editing conditional")
reminder_text = reminder_text.replace(reminder_old, reminder_new, 1)
reminder_terminal = """        )
      ) : null}

      {toast ? (
"""
reminder_terminal_new = """        )}
        </Suspense>
      ) : null}

      {toast ? (
"""
if reminder_terminal not in reminder_text:
    raise SystemExit("Missing reminder editing conditional terminator")
reminder_text = reminder_text.replace(reminder_terminal, reminder_terminal_new, 1)
Path(reminder_path).write_text(reminder_text)

'''
text = text[:insert_at] + reminder_patch + text[insert_at:]

# Keep the Node-only performance check under the repo's no-globals ESLint rules.
text = text.replace(
    "import { join } from 'node:path';\nimport { gzipSync } from 'node:zlib';",
    "import { join } from 'node:path';\nimport { cwd, stdout } from 'node:process';\nimport { gzipSync } from 'node:zlib';",
    1,
)
text = text.replace("const distDir = join(process.cwd(), 'dist');", "const distDir = join(cwd(), 'dist');", 1)
text = text.replace(
    "console.log(\n  `[perf] entry ${(entryBytes / 1024).toFixed(1)} KiB (${(entryGzipBytes / 1024).toFixed(1)} KiB gzip); OCR deferred from precache; ${coreFiles.length} LSTM core assets.`,\n);",
    "stdout.write(\n  `[perf] entry ${(entryBytes / 1024).toFixed(1)} KiB (${(entryGzipBytes / 1024).toFixed(1)} KiB gzip); OCR deferred from precache; ${coreFiles.length} local core assets.\\n`,\n);",
    1,
)

# Append behavioral compatibility corrections after the performance transformations.
text += r'''

# Keep tiny, latency-sensitive controls eager. Their savings are negligible, while
# synchronous mount/focus semantics are part of existing keyboard and selection UX.
app_shell_path = Path("src/app/AppShell.tsx")
app_shell = app_shell_path.read_text()
app_shell = app_shell.replace(
    "import type { CommandPaletteItem } from '../features/commands/CommandPalette';\n",
    "import type { CommandPaletteItem } from '../features/commands/CommandPalette';\n"
    "import { LabelManagerDialog } from '../features/notes/LabelManagerDialog';\n",
    1,
)
label_lazy = """const LabelManagerDialog = lazy(() =>
  import('../features/notes/LabelManagerDialog').then((module) => ({
    default: module.LabelManagerDialog,
  })),
);
"""
if app_shell.count(label_lazy) != 1:
    raise SystemExit("Could not restore eager LabelManagerDialog")
app_shell_path.write_text(app_shell.replace(label_lazy, "", 1))

notes_workspace_path = Path("src/features/notes/NotesWorkspace.tsx")
notes_workspace = notes_workspace_path.read_text()
notes_workspace = notes_workspace.replace(
    "import {\n  clearChecklistEditorJournal,",
    "import { BulkSelectionToolbar } from './BulkSelectionToolbar';\n"
    "import {\n  clearChecklistEditorJournal,",
    1,
)
bulk_lazy = """const BulkSelectionToolbar = lazy(() =>
  import('./BulkSelectionToolbar').then((module) => ({ default: module.BulkSelectionToolbar })),
);
"""
if notes_workspace.count(bulk_lazy) != 1:
    raise SystemExit("Could not restore eager BulkSelectionToolbar")
notes_workspace_path.write_text(notes_workspace.replace(bulk_lazy, "", 1))

# Preserve all Tesseract core fallbacks on the deployment. OCR is still excluded
# from install-time precache, so this compatibility choice does not restore the
# 49 MiB install cost.
replace_exact(
    "scripts/prepare-ocr-assets.mjs",
    "  if (!/^tesseract-core(?:-simd)?-lstm\\.wasm(?:\\.js)?$/u.test(fileName)) continue;",
    "  if (!/^tesseract-core(?:-[a-z]+)*(?:-lstm)?\\.wasm(?:\\.js)?$/u.test(fileName)) continue;",
)

budget_path = Path("scripts/check-performance-budget.mjs")
budget = budget_path.read_text()
legacy_assertion = """const unexpectedCore = coreFiles.filter((name) => !/-lstm\\.wasm(?:\\.js)?$/u.test(name));
if (unexpectedCore.length > 0) {
  throw new Error(`Unexpected legacy OCR cores in dist: ${unexpectedCore.join(', ')}`);
}

"""
if budget.count(legacy_assertion) != 1:
    raise SystemExit("Could not relax OCR core deployment assertion")
budget_path.write_text(budget.replace(legacy_assertion, "", 1))

# Search itself is deferred, so ArrowDown retries briefly until a cold local chunk
# has mounted the first result instead of losing the keyboard handoff.
header_path = Path("src/components/AppHeader.tsx")
header = header_path.read_text()
old_arrow = """              if (event.key === 'ArrowDown') {
                const target = historyVisible
                  ? document.querySelector<HTMLButtonElement>(
                      '.search-history-popover .search-history-apply',
                    )
                  : document.querySelector<HTMLButtonElement>(
                      '.search-result-section .note-card-open',
                    );
                if (target) {
                  event.preventDefault();
                  target.focus();
                }
                return;
              }
"""
new_arrow = """              if (event.key === 'ArrowDown') {
                event.preventDefault();
                const selector = historyVisible
                  ? '.search-history-popover .search-history-apply'
                  : '.search-result-section .note-card-open';
                const focusTarget = () => {
                  const target = document.querySelector<HTMLButtonElement>(selector);
                  if (!target) return false;
                  target.focus();
                  return true;
                };
                if (focusTarget()) return;

                const input = event.currentTarget;
                let attempts = 0;
                const focusWhenReady = () => {
                  if (document.activeElement !== input) return;
                  if (focusTarget()) return;
                  attempts += 1;
                  if (attempts < 120) window.requestAnimationFrame(focusWhenReady);
                };
                window.requestAnimationFrame(focusWhenReady);
                return;
              }
"""
if header.count(old_arrow) != 1:
    raise SystemExit("Could not patch deferred search focus handoff")
header_path.write_text(header.replace(old_arrow, new_arrow, 1))
'''

path.write_text(text)
