from pathlib import Path

path = Path('scripts/v3-3-apply.py')
text = path.read_text()

start = text.index('# Add a hard performance budget to every production build.')
end = text.index('Path("scripts/check-performance-budget.mjs")', start)
replacement = '''# Add a hard performance budget to every production build.\nreplace_exact(\n    "package.json",\n    '    "build": "npm run ocr:assets && npm run typecheck && vite build",\\n',\n    '    "build": "npm run ocr:assets && npm run typecheck && vite build && npm run perf:check",\\n    "    \\"perf:check\\": \\"node scripts/check-performance-budget.mjs\\",\\n',\n)\n\n'''
text = text[:start] + replacement + text[end:]

text = text.replace(
    'text = text.replace(start, "      {editing ? (\\n        <Suspense fallback={<span className=\\"deferred-note-surface\\" role=\\"status\\">Opening note…</span>}>\\n", 1)',
    'text = text.replace(start, "      {editing ? (\\n        <Suspense fallback={<span className=\\"deferred-note-surface\\" role=\\"status\\">Opening note…</span>}>\\n          {", 1)',
)
text = text.replace(
    'text = text.replace("      ) : null}\\n\\n      {toast ? <LifecycleToast", "        </Suspense>\\n      ) : null}\\n\\n      {toast ? <LifecycleToast", 1)',
    'text = text.replace("      ) : null}\\n\\n      {toast ? <LifecycleToast", "          }\\n        </Suspense>\\n      ) : null}\\n\\n      {toast ? <LifecycleToast", 1)',
)

checklist_start = text.index('# Checklist capture only needs attachments after the user opens that panel.')
checklist_end = text.index('# Search and reminder browsing should not drag full editors into their first-load chunks.', checklist_start)
checklist_section = text[checklist_start:checklist_end].replace('noteId={activeNoteId}', 'noteId={attachmentNoteId}')
text = text[:checklist_start] + checklist_section + text[checklist_end:]

path.write_text(text)
