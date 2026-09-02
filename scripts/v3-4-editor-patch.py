from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} marker changed')
    return text.replace(old, new, 1)


# Text editor
path = Path('src/features/notes/NoteEditorDialog.tsx')
text = path.read_text()
text = replace_once(
    text,
    "import { AttachmentPanel } from './AttachmentPanel';\n",
    "import { AttachmentPanel } from './AttachmentPanel';\nimport { EditorCloseButton, EditorStatusBar } from './EditorStatusBar';\nimport { textEditorMetrics } from './editorInsights';\n",
    'text editor imports',
)
text = replace_once(
    text,
    "  const { draft, errorMessage, status, setTitle, setContent, saveNow, finishEditing, retrySave } =\n    useExistingNoteEditor({\n",
    "  const {\n    draft,\n    errorMessage,\n    status,\n    hasPendingChanges,\n    lastSavedAt,\n    setTitle,\n    setContent,\n    saveNow,\n    finishEditing,\n    retrySave,\n  } = useExistingNoteEditor({\n",
    'text editor hook fields',
)
marker = "  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {\n"
insert = "  const metrics = useMemo(() => {\n    const current = textEditorMetrics(draft.content);\n    return [\n      `${current.words} ${current.words === 1 ? 'word' : 'words'}`,\n      `${current.characters} ${current.characters === 1 ? 'character' : 'characters'}`,\n    ];\n  }, [draft.content]);\n\n"
if insert not in text:
    if marker not in text:
        raise SystemExit('text editor metrics marker changed')
    text = text.replace(marker, insert + marker, 1)
old_state = """            <div className="note-editor-state" aria-live="polite">
              {status === 'saving' ? <span className="sr-only">Saving…</span> : null}
              {errorMessage ? (
                <span className="note-editor-error" role="alert">
                  {errorMessage}
                  <button type="button" onClick={retrySave}>
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
"""
new_state = """            <EditorStatusBar
              status={status}
              hasPendingChanges={hasPendingChanges}
              lastSavedAt={lastSavedAt}
              metrics={metrics}
              errorMessage={errorMessage}
              onRetry={retrySave}
            />
"""
text = replace_once(text, old_state, new_state, 'text editor status')
old_close = """              <button
                className="note-editor-close"
                type="button"
                onClick={() => void finishEditing()}
              >
                Close
              </button>
"""
new_close = """              <EditorCloseButton onClick={() => void finishEditing()} />
"""
text = replace_once(text, old_close, new_close, 'text editor close')
path.write_text(text)


# Checklist editor
path = Path('src/features/notes/ChecklistEditorDialog.tsx')
text = path.read_text()
text = replace_once(
    text,
    "  useEffect,\n  useRef,\n",
    "  useEffect,\n  useMemo,\n  useRef,\n",
    'checklist useMemo import',
)
text = replace_once(
    text,
    "import { AttachmentPanel } from './AttachmentPanel';\n",
    "import { AttachmentPanel } from './AttachmentPanel';\nimport { EditorCloseButton, EditorStatusBar } from './EditorStatusBar';\nimport { checklistEditorMetrics } from './editorInsights';\n",
    'checklist editor imports',
)
text = replace_once(
    text,
    "  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n",
    "  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n  const [lastSavedAt, setLastSavedAt] = useState(note.updatedAt);\n  const [hasPendingChanges, setHasPendingChanges] = useState(() => initial.journal !== null);\n",
    'checklist save feedback state',
)
text = replace_once(
    text,
    "      onSaved(saved.note, saved.items);\n      if (mountedRef.current) setStatus('idle');\n\n      const pending = pendingDraftRef.current;\n      if (sameDraft(pending, snapshot)) clearChecklistEditorJournal();\n      else {\n",
    "      onSaved(saved.note, saved.items);\n      if (mountedRef.current) {\n        setStatus('idle');\n        setLastSavedAt(saved.note.updatedAt);\n      }\n\n      const pending = pendingDraftRef.current;\n      if (sameDraft(pending, snapshot)) {\n        clearChecklistEditorJournal();\n        if (mountedRef.current) setHasPendingChanges(false);\n      } else {\n",
    'checklist saved feedback',
)
text = replace_once(
    text,
    "        writeChecklistEditorJournal({\n          noteId: saved.note.id,\n          title: pending.title,\n          items: pending.items,\n        });\n      }\n",
    "        writeChecklistEditorJournal({\n          noteId: saved.note.id,\n          title: pending.title,\n          items: pending.items,\n        });\n        if (mountedRef.current) setHasPendingChanges(true);\n      }\n",
    'checklist pending feedback',
)
text = replace_once(
    text,
    "      if (mountedRef.current) {\n        setStatus('error');\n        setErrorMessage(toErrorMessage(error));\n      }\n      throw error;\n",
    "      if (mountedRef.current) {\n        setStatus('error');\n        setErrorMessage(toErrorMessage(error));\n        setHasPendingChanges(true);\n      }\n      throw error;\n",
    'checklist error feedback',
)
text = replace_once(
    text,
    "      setStatus('idle');\n      setErrorMessage(null);\n      scheduleSave(nextDraft);\n",
    "      setStatus('idle');\n      setErrorMessage(null);\n      setHasPendingChanges(true);\n      scheduleSave(nextDraft);\n",
    'checklist draft feedback',
)
marker = "  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {\n"
insert = "  const metrics = useMemo(() => {\n    const current = checklistEditorMetrics(draft.items);\n    return [\n      `${current.items} ${current.items === 1 ? 'item' : 'items'}`,\n      `${current.completed} completed`,\n    ];\n  }, [draft.items]);\n\n"
if insert not in text:
    if marker not in text:
        raise SystemExit('checklist metrics marker changed')
    text = text.replace(marker, insert + marker, 1)
old_state = """            <div className="note-editor-state" aria-live="polite">
              {status === 'saving' ? <span className="sr-only">Saving…</span> : null}
              {errorMessage ? (
                <span className="note-editor-error" role="alert">
                  {errorMessage}
                  <button type="button" onClick={() => void persistLatest()}>
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
"""
new_state = """            <EditorStatusBar
              status={status}
              hasPendingChanges={hasPendingChanges}
              lastSavedAt={lastSavedAt}
              metrics={metrics}
              errorMessage={errorMessage}
              onRetry={() => void persistLatest()}
            />
"""
text = replace_once(text, old_state, new_state, 'checklist editor status')
old_close = """              <button className="note-editor-close" type="button" onClick={() => void finish()}>
                Close
              </button>
"""
new_close = """              <EditorCloseButton onClick={() => void finish()} />
"""
text = replace_once(text, old_close, new_close, 'checklist editor close')
path.write_text(text)
