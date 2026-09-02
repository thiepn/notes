from pathlib import Path

path = Path('scripts/v3-3-apply.py')
text = path.read_text()

start = text.index('# Add a hard performance budget to every production build.')
end = text.index('Path("scripts/check-performance-budget.mjs")', start)
replacement = '''# Add a hard performance budget to every production build.\nreplace_exact(\n    "package.json",\n    '    "build": "npm run ocr:assets && npm run typecheck && vite build",\\n',\n    '    "build": "npm run ocr:assets && npm run typecheck && vite build && npm run perf:check",\\n    "    \\"perf:check\\": \\"node scripts/check-performance-budget.mjs\\",\\n',\n)\n\n'''
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

# RemindersWorkspace uses editingNote/editingNoteId. Patch it explicitly.
insert_at = text.index('# PWA: OCR stays local')
reminder_patch = r'''
# Reminder browsing also defers editor implementation until a reminder note is opened.
reminder_path = "src/features/reminders/RemindersWorkspace.tsx"
reminder_text = Path(reminder_path).read_text()
reminder_text = reminder_text.replace(
    "import { useCallback, useEffect, useMemo, useState } from 'react';",
    "import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';",
    1,
)
reminder_text = reminder_text.replace("import { ChecklistEditorDialog } from '../notes/ChecklistEditorDialog';\n", "", 1)
reminder_text = reminder_text.replace("import { NoteEditorDialog } from '../notes/NoteEditorDialog';\n", "", 1)
reminder_marker = "const attachmentsRepository = new AttachmentsRepository(notesDatabase);\n"
if reminder_marker not in reminder_text:
    raise SystemExit("Missing reminders attachments repository marker")
reminder_text = reminder_text.replace(
    reminder_marker,
    reminder_marker
    + "const ChecklistEditorDialog = lazy(() =>\\n"
      "  import('../notes/ChecklistEditorDialog').then((module) => ({ default: module.ChecklistEditorDialog })),\\n"
      ");\\n"
      "const NoteEditorDialog = lazy(() =>\\n"
      "  import('../notes/NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),\\n"
      ");\\n",
    1,
)
reminder_start = "      {editingNote ? (\n"
if reminder_start not in reminder_text:
    raise SystemExit("Missing reminder editing conditional")
reminder_text = reminder_text.replace(
    reminder_start,
    "      {editingNote ? (\\n"
    "        <Suspense fallback={<span className=\\\"deferred-note-surface\\\" role=\\\"status\\\">Opening note…</span>}>\\n"
    "          {",
    1,
)
reminder_terminal = "      ) : null}\n\n      {toast ? ("
if reminder_terminal not in reminder_text:
    raise SystemExit("Missing reminder editing conditional terminator")
reminder_text = reminder_text.replace(
    reminder_terminal,
    "          }\\n        </Suspense>\\n      ) : null}\\n\\n      {toast ? (",
    1,
)
Path(reminder_path).write_text(reminder_text)

'''
text = text[:insert_at] + reminder_patch + text[insert_at:]

path.write_text(text)
