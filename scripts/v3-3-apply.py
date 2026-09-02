from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new))


# App-level route/dialog code splitting. Keep the primary Notes workspace eager.
replace_exact(
    "src/app/AppShell.tsx",
    "import { useCallback, useEffect, useState } from 'react';",
    "import { Suspense, lazy, useCallback, useEffect, useState } from 'react';",
)
replace_exact(
    "src/app/AppShell.tsx",
    "import { BackupWorkspace } from '../features/backup/BackupWorkspace';\n",
    "",
)
replace_exact(
    "src/app/AppShell.tsx",
    "import { CommandPalette, type CommandPaletteItem } from '../features/commands/CommandPalette';\nimport { LabelManagerDialog } from '../features/notes/LabelManagerDialog';\n",
    "import type { CommandPaletteItem } from '../features/commands/CommandPalette';\n",
)
replace_exact(
    "src/app/AppShell.tsx",
    "import { RemindersWorkspace } from '../features/reminders/RemindersWorkspace';\nimport { SearchWorkspace } from '../features/search/SearchWorkspace';\n",
    "",
)
replace_exact(
    "src/app/AppShell.tsx",
    "const labelsRepository = new LabelsRepository(notesDatabase);\n",
    """const labelsRepository = new LabelsRepository(notesDatabase);\n\nconst BackupWorkspace = lazy(() =>\n  import('../features/backup/BackupWorkspace').then((module) => ({\n    default: module.BackupWorkspace,\n  })),\n);\nconst CommandPalette = lazy(() =>\n  import('../features/commands/CommandPalette').then((module) => ({\n    default: module.CommandPalette,\n  })),\n);\nconst LabelManagerDialog = lazy(() =>\n  import('../features/notes/LabelManagerDialog').then((module) => ({\n    default: module.LabelManagerDialog,\n  })),\n);\nconst RemindersWorkspace = lazy(() =>\n  import('../features/reminders/RemindersWorkspace').then((module) => ({\n    default: module.RemindersWorkspace,\n  })),\n);\nconst SearchWorkspace = lazy(() =>\n  import('../features/search/SearchWorkspace').then((module) => ({\n    default: module.SearchWorkspace,\n  })),\n);\n""",
)
replace_exact(
    "src/app/AppShell.tsx",
    """            {searchActive ? (\n              <SearchWorkspace\n                query={searchQuery}\n                filters={searchFilters}\n                filtersOpen={searchFiltersOpen}\n                labels={labels}\n                onFiltersChange={setSearchFilters}\n                onCloseFilters={() => setSearchFiltersOpen(false)}\n                onClearSearch={clearSearch}\n              />\n            ) : activeSection === 'backup' ? (\n              <BackupWorkspace onRestored={handleLibraryRestored} onImported={refreshLabels} />\n            ) : activeSection === 'reminders' ? (\n              <RemindersWorkspace labels={labels} />\n""",
    """            {searchActive ? (\n              <Suspense fallback={<DeferredWorkspaceFallback label=\"Loading search…\" />}>\n                <SearchWorkspace\n                  query={searchQuery}\n                  filters={searchFilters}\n                  filtersOpen={searchFiltersOpen}\n                  labels={labels}\n                  onFiltersChange={setSearchFilters}\n                  onCloseFilters={() => setSearchFiltersOpen(false)}\n                  onClearSearch={clearSearch}\n                />\n              </Suspense>\n            ) : activeSection === 'backup' ? (\n              <Suspense fallback={<DeferredWorkspaceFallback label=\"Loading backup tools…\" />}>\n                <BackupWorkspace onRestored={handleLibraryRestored} onImported={refreshLabels} />\n              </Suspense>\n            ) : activeSection === 'reminders' ? (\n              <Suspense fallback={<DeferredWorkspaceFallback label=\"Loading reminders…\" />}>\n                <RemindersWorkspace labels={labels} />\n              </Suspense>\n""",
)
replace_exact(
    "src/app/AppShell.tsx",
    """      {labelManagerOpen ? (\n        <LabelManagerDialog\n          labels={labels}\n          onClose={() => setLabelManagerOpen(false)}\n          onCreate={handleCreateLabel}\n          onRename={handleRenameLabel}\n          onDelete={handleDeleteLabel}\n        />\n      ) : null}\n\n      {commandPaletteOpen ? (\n        <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />\n      ) : null}\n""",
    """      {labelManagerOpen ? (\n        <Suspense fallback={null}>\n          <LabelManagerDialog\n            labels={labels}\n            onClose={() => setLabelManagerOpen(false)}\n            onCreate={handleCreateLabel}\n            onRename={handleRenameLabel}\n            onDelete={handleDeleteLabel}\n          />\n        </Suspense>\n      ) : null}\n\n      {commandPaletteOpen ? (\n        <Suspense fallback={null}>\n          <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />\n        </Suspense>\n      ) : null}\n""",
)
replace_exact(
    "src/app/AppShell.tsx",
    "function SectionPlaceholder({ title, description }: { title: string; description: string }) {",
    """function DeferredWorkspaceFallback({ label }: { label: string }) {\n  return (\n    <div className=\"deferred-workspace-loading\" role=\"status\" aria-live=\"polite\">\n      {label}\n    </div>\n  );\n}\n\nfunction SectionPlaceholder({ title, description }: { title: string; description: string }) {""",
)

# Notes workspace: defer checklist capture, editors, bulk toolbar, and confirmation dialogs.
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
    "import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';",
)
for line in [
    "import { BulkSelectionToolbar } from './BulkSelectionToolbar';\n",
    "import { ChecklistComposer } from './ChecklistComposer';\n",
    "import { ChecklistEditorDialog } from './ChecklistEditorDialog';\n",
    "import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';\n",
    "import { NoteEditorDialog } from './NoteEditorDialog';\n",
]:
    replace_exact("src/features/notes/NotesWorkspace.tsx", line, "")
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    "const bulkActionsRepository = new BulkActionsRepository(notesDatabase);\n",
    """const bulkActionsRepository = new BulkActionsRepository(notesDatabase);\n\nconst BulkSelectionToolbar = lazy(() =>\n  import('./BulkSelectionToolbar').then((module) => ({ default: module.BulkSelectionToolbar })),\n);\nconst ChecklistComposer = lazy(() =>\n  import('./ChecklistComposer').then((module) => ({ default: module.ChecklistComposer })),\n);\nconst ChecklistEditorDialog = lazy(() =>\n  import('./ChecklistEditorDialog').then((module) => ({ default: module.ChecklistEditorDialog })),\n);\nconst ConfirmDeleteDialog = lazy(() =>\n  import('./ConfirmDeleteDialog').then((module) => ({ default: module.ConfirmDeleteDialog })),\n);\nconst NoteEditorDialog = lazy(() =>\n  import('./NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),\n);\n""",
)
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    """        checklistCaptureOpen ? (\n          <ChecklistComposer\n            repository={checklistsRepository}\n            notesRepository={notesRepository}\n            attachmentsRepository={attachmentsRepository}\n            beforeSaved={prepareCapturedNote}\n            onSaved={handleChecklistSaved}\n            onRemoved={handleRemoved}\n            onActiveNoteChange={setActiveCaptureNoteId}\n            onAttachmentsChanged={handleAttachmentsChanged}\n            onFinished={() => setChecklistCaptureOpen(false)}\n          />\n""",
    """        checklistCaptureOpen ? (\n          <Suspense fallback={<DeferredNoteSurface label=\"Loading checklist…\" />}>\n            <ChecklistComposer\n              repository={checklistsRepository}\n              notesRepository={notesRepository}\n              attachmentsRepository={attachmentsRepository}\n              beforeSaved={prepareCapturedNote}\n              onSaved={handleChecklistSaved}\n              onRemoved={handleRemoved}\n              onActiveNoteChange={setActiveCaptureNoteId}\n              onAttachmentsChanged={handleAttachmentsChanged}\n              onFinished={() => setChecklistCaptureOpen(false)}\n            />\n          </Suspense>\n""",
)
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    """          {selectionActive ? (\n            <BulkSelectionToolbar\n              mode={mode}\n              selectedNotes={selectedNotes}\n              visibleCount={visibleNotes.length}\n              labels={labels}\n              labelIdsByNote={labelIdsByNote}\n              onClear={clearSelection}\n              onSelectAll={handleSelectAll}\n              onSetPinned={(pinned) => void handleBulkSetPinned(pinned)}\n              onArchive={() => void handleBulkArchive()}\n              onUnarchive={() => void handleBulkUnarchive()}\n              onTrash={() => void handleBulkTrash()}\n              onRestore={() => void handleBulkRestore()}\n              onDeletePermanently={() => setBulkDeleteIds(selectedNotes.map((note) => note.id))}\n              onSetColor={(color) => void handleBulkSetColor(color)}\n              onSetLabelMembership={(labelId, assigned) =>\n                void handleBulkSetLabelMembership(labelId, assigned)\n              }\n            />\n""",
    """          {selectionActive ? (\n            <Suspense fallback={null}>\n              <BulkSelectionToolbar\n                mode={mode}\n                selectedNotes={selectedNotes}\n                visibleCount={visibleNotes.length}\n                labels={labels}\n                labelIdsByNote={labelIdsByNote}\n                onClear={clearSelection}\n                onSelectAll={handleSelectAll}\n                onSetPinned={(pinned) => void handleBulkSetPinned(pinned)}\n                onArchive={() => void handleBulkArchive()}\n                onUnarchive={() => void handleBulkUnarchive()}\n                onTrash={() => void handleBulkTrash()}\n                onRestore={() => void handleBulkRestore()}\n                onDeletePermanently={() => setBulkDeleteIds(selectedNotes.map((note) => note.id))}\n                onSetColor={(color) => void handleBulkSetColor(color)}\n                onSetLabelMembership={(labelId, assigned) =>\n                  void handleBulkSetLabelMembership(labelId, assigned)\n                }\n              />\n            </Suspense>\n""",
)
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    """      {editingNote && mode !== 'trash' ? (\n        editingNote.type === 'checklist' ? (\n          <ChecklistEditorDialog\n            key={editingNote.id}\n            note={editingNote}\n            items={checklistItemsByNote[editingNote.id] ?? []}\n            repository={checklistsRepository}\n            attachmentsRepository={attachmentsRepository}\n            attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}\n            onSaved={handleChecklistSaved}\n            onAttachmentsChanged={handleAttachmentsChanged}\n            onConverted={handleConvertedToText}\n            onClose={() => setEditingNoteId(null)}\n          />\n        ) : (\n          <NoteEditorDialog\n            key={editingNote.id}\n            note={editingNote}\n            repository={notesRepository}\n            attachmentsRepository={attachmentsRepository}\n            attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}\n            onSaved={handleSaved}\n            onAttachmentsChanged={handleAttachmentsChanged}\n            onHistoryChecklistSaved={handleChecklistSaved}\n            onConvertToChecklist={async () => {\n              try {\n                const converted = await checklistsRepository.convertTextToChecklist(editingNote.id);\n                handleChecklistSaved(converted.note, converted.items);\n                setEditingNoteId(converted.note.id);\n              } catch {\n                showToast('Note could not be converted to a checklist.');\n              }\n            }}\n            onClose={() => setEditingNoteId(null)}\n          />\n        )\n      ) : null}\n""",
    """      {editingNote && mode !== 'trash' ? (\n        <Suspense fallback={<DeferredNoteSurface label=\"Opening note…\" />}>\n          {editingNote.type === 'checklist' ? (\n            <ChecklistEditorDialog\n              key={editingNote.id}\n              note={editingNote}\n              items={checklistItemsByNote[editingNote.id] ?? []}\n              repository={checklistsRepository}\n              attachmentsRepository={attachmentsRepository}\n              attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}\n              onSaved={handleChecklistSaved}\n              onAttachmentsChanged={handleAttachmentsChanged}\n              onConverted={handleConvertedToText}\n              onClose={() => setEditingNoteId(null)}\n            />\n          ) : (\n            <NoteEditorDialog\n              key={editingNote.id}\n              note={editingNote}\n              repository={notesRepository}\n              attachmentsRepository={attachmentsRepository}\n              attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}\n              onSaved={handleSaved}\n              onAttachmentsChanged={handleAttachmentsChanged}\n              onHistoryChecklistSaved={handleChecklistSaved}\n              onConvertToChecklist={async () => {\n                try {\n                  const converted = await checklistsRepository.convertTextToChecklist(editingNote.id);\n                  handleChecklistSaved(converted.note, converted.items);\n                  setEditingNoteId(converted.note.id);\n                } catch {\n                  showToast('Note could not be converted to a checklist.');\n                }\n              }}\n              onClose={() => setEditingNoteId(null)}\n            />\n          )}\n        </Suspense>\n      ) : null}\n""",
)
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    """      {deleteCandidate ? (\n        <ConfirmDeleteDialog\n          title={deleteCandidate.title}\n          onCancel={() => setDeleteCandidate(null)}\n          onConfirm={() => void handleConfirmDelete()}\n        />\n      ) : null}\n      {bulkDeleteIds ? (\n        <ConfirmDeleteDialog\n          count={bulkDeleteIds.length}\n          onCancel={() => setBulkDeleteIds(null)}\n          onConfirm={() => void handleConfirmBulkDelete()}\n        />\n      ) : null}\n""",
    """      {deleteCandidate ? (\n        <Suspense fallback={null}>\n          <ConfirmDeleteDialog\n            title={deleteCandidate.title}\n            onCancel={() => setDeleteCandidate(null)}\n            onConfirm={() => void handleConfirmDelete()}\n          />\n        </Suspense>\n      ) : null}\n      {bulkDeleteIds ? (\n        <Suspense fallback={null}>\n          <ConfirmDeleteDialog\n            count={bulkDeleteIds.length}\n            onCancel={() => setBulkDeleteIds(null)}\n            onConfirm={() => void handleConfirmBulkDelete()}\n          />\n        </Suspense>\n      ) : null}\n""",
)
replace_exact(
    "src/features/notes/NotesWorkspace.tsx",
    "function NoteSection({",
    """function DeferredNoteSurface({ label }: { label: string }) {\n  return (\n    <div className=\"deferred-note-surface\" role=\"status\" aria-live=\"polite\">\n      {label}\n    </div>\n  );\n}\n\nfunction NoteSection({""",
)

# Text composer: advanced attachments and media dialogs should not be in the entry bundle.
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "  useCallback,\n",
    "  Suspense,\n  lazy,\n  useCallback,\n",
)
for line in [
    "import { DrawingAttachmentButton } from '../drawing/DrawingAttachmentButton';\n",
    "import { DrawingDialog } from '../drawing/DrawingDialog';\n",
    "import { OcrAttachmentControl } from '../ocr/OcrAttachmentControl';\n",
    "import { VoiceAttachmentButton } from '../voice/VoiceAttachmentButton';\n",
    "import { VoiceRecorderDialog } from '../voice/VoiceRecorderDialog';\n",
    "import { AttachmentPanel } from './AttachmentPanel';\n",
]:
    replace_exact("src/features/notes/TextNoteComposer.tsx", line, "")
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "const voiceAttachmentsRepository = new VoiceAttachmentsRepository(notesDatabase);\n",
    """const DrawingAttachmentButton = lazy(() =>\n  import('../drawing/DrawingAttachmentButton').then((module) => ({\n    default: module.DrawingAttachmentButton,\n  })),\n);\nconst DrawingDialog = lazy(() =>\n  import('../drawing/DrawingDialog').then((module) => ({ default: module.DrawingDialog })),\n);\nconst OcrAttachmentControl = lazy(() =>\n  import('../ocr/OcrAttachmentControl').then((module) => ({ default: module.OcrAttachmentControl })),\n);\nconst VoiceAttachmentButton = lazy(() =>\n  import('../voice/VoiceAttachmentButton').then((module) => ({\n    default: module.VoiceAttachmentButton,\n  })),\n);\nconst VoiceRecorderDialog = lazy(() =>\n  import('../voice/VoiceRecorderDialog').then((module) => ({\n    default: module.VoiceRecorderDialog,\n  })),\n);\nconst AttachmentPanel = lazy(() =>\n  import('./AttachmentPanel').then((module) => ({ default: module.AttachmentPanel })),\n);\n\nconst voiceAttachmentsRepository = new VoiceAttachmentsRepository(notesDatabase);\n""",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    """        <div className=\"note-composer-secondary-panel\">\n          <AttachmentPanel\n            noteId={activeNoteId}\n            repository={attachmentsRepository}\n            ensureNoteId={ensureNoteId}\n            refreshKey={attachmentRefreshKey}\n            onChanged={markAttachmentsChanged}\n          />\n        </div>\n""",
    """        <div className=\"note-composer-secondary-panel\">\n          <Suspense fallback={<DeferredComposerTool label=\"Loading attachments…\" />}>\n            <AttachmentPanel\n              noteId={activeNoteId}\n              repository={attachmentsRepository}\n              ensureNoteId={ensureNoteId}\n              refreshKey={attachmentRefreshKey}\n              onChanged={markAttachmentsChanged}\n            />\n          </Suspense>\n        </div>\n""",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    """                <DrawingAttachmentButton\n                  noteId={activeNoteId}\n                  repository={attachmentsRepository}\n                  ensureNoteId={ensureNoteId}\n                  className=\"note-composer-menu-control\"\n                  onDialogClose={() => setExpandedToolsOpen(false)}\n                  onChanged={(noteId) => {\n                    setExpandedToolsOpen(false);\n                    markAttachmentsChanged(noteId);\n                  }}\n                />\n                <VoiceAttachmentButton\n                  noteId={activeNoteId}\n                  repository={voiceAttachmentsRepository}\n                  ensureNoteId={ensureNoteId}\n                  className=\"note-composer-menu-control\"\n                  onDialogClose={() => setExpandedToolsOpen(false)}\n                  onChanged={(noteId) => {\n                    setExpandedToolsOpen(false);\n                    markAttachmentsChanged(noteId);\n                  }}\n                />\n                <OcrAttachmentControl\n                  noteId={activeNoteId}\n                  repository={attachmentsRepository}\n                  refreshKey={attachmentRefreshKey}\n                  onAppend={(text) => {\n                    setExpandedToolsOpen(false);\n                    setContent(appendOcrText(draft.content, text));\n                  }}\n                />\n""",
    """                <Suspense fallback={<DeferredComposerTool label=\"Loading tools…\" />}>\n                  <DrawingAttachmentButton\n                    noteId={activeNoteId}\n                    repository={attachmentsRepository}\n                    ensureNoteId={ensureNoteId}\n                    className=\"note-composer-menu-control\"\n                    onDialogClose={() => setExpandedToolsOpen(false)}\n                    onChanged={(noteId) => {\n                      setExpandedToolsOpen(false);\n                      markAttachmentsChanged(noteId);\n                    }}\n                  />\n                  <VoiceAttachmentButton\n                    noteId={activeNoteId}\n                    repository={voiceAttachmentsRepository}\n                    ensureNoteId={ensureNoteId}\n                    className=\"note-composer-menu-control\"\n                    onDialogClose={() => setExpandedToolsOpen(false)}\n                    onChanged={(noteId) => {\n                      setExpandedToolsOpen(false);\n                      markAttachmentsChanged(noteId);\n                    }}\n                  />\n                  <OcrAttachmentControl\n                    noteId={activeNoteId}\n                    repository={attachmentsRepository}\n                    refreshKey={attachmentRefreshKey}\n                    onAppend={(text) => {\n                      setExpandedToolsOpen(false);\n                      setContent(appendOcrText(draft.content, text));\n                    }}\n                  />\n                </Suspense>\n""",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    """      {quickDrawingOpen ? (\n        <DrawingDialog onSave={handleQuickDrawing} onClose={() => setQuickDrawingOpen(false)} />\n      ) : null}\n      {quickVoiceOpen ? (\n        <VoiceRecorderDialog onSave={handleQuickVoice} onClose={() => setQuickVoiceOpen(false)} />\n      ) : null}\n""",
    """      {quickDrawingOpen ? (\n        <Suspense fallback={null}>\n          <DrawingDialog onSave={handleQuickDrawing} onClose={() => setQuickDrawingOpen(false)} />\n        </Suspense>\n      ) : null}\n      {quickVoiceOpen ? (\n        <Suspense fallback={null}>\n          <VoiceRecorderDialog onSave={handleQuickVoice} onClose={() => setQuickVoiceOpen(false)} />\n        </Suspense>\n      ) : null}\n""",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "function toErrorMessage(error: unknown): string {",
    """function DeferredComposerTool({ label }: { label: string }) {\n  return (\n    <span className=\"deferred-composer-tool\" role=\"status\">\n      {label}\n    </span>\n  );\n}\n\nfunction toErrorMessage(error: unknown): string {""",
)

# Checklist capture only needs attachments after the user opens that panel.
replace_exact(
    "src/features/notes/ChecklistComposer.tsx",
    "  useCallback,\n",
    "  Suspense,\n  lazy,\n  useCallback,\n",
)
replace_exact("src/features/notes/ChecklistComposer.tsx", "import { AttachmentPanel } from './AttachmentPanel';\n", "")
replace_exact(
    "src/features/notes/ChecklistComposer.tsx",
    "const AUTOSAVE_DELAY_MS = 180;\n",
    """const AttachmentPanel = lazy(() =>\n  import('./AttachmentPanel').then((module) => ({ default: module.AttachmentPanel })),\n);\n\nconst AUTOSAVE_DELAY_MS = 180;\n""",
)
replace_exact(
    "src/features/notes/ChecklistComposer.tsx",
    """          <AttachmentPanel\n            noteId={activeNoteId}\n            repository={attachmentsRepository}\n            ensureNoteId={ensureNoteId}\n            refreshKey={attachmentRefreshKey}\n            onChanged={markAttachmentsChanged}\n          />\n""",
    """          <Suspense fallback={<span role=\"status\">Loading attachments…</span>}>\n            <AttachmentPanel\n              noteId={activeNoteId}\n              repository={attachmentsRepository}\n              ensureNoteId={ensureNoteId}\n              refreshKey={attachmentRefreshKey}\n              onChanged={markAttachmentsChanged}\n            />\n          </Suspense>\n""",
)

# Search and reminder browsing should not drag full editors into their first-load chunks.
for path in ["src/features/search/SearchWorkspace.tsx", "src/features/reminders/RemindersWorkspace.tsx"]:
    text = Path(path).read_text()
    text = text.replace("import { useCallback, useEffect, useMemo, useRef, useState } from 'react';", "import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';")
    text = text.replace("import { useCallback, useEffect, useMemo, useState } from 'react';", "import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';")
    text = text.replace("import { ChecklistEditorDialog } from '../notes/ChecklistEditorDialog';\n", "")
    text = text.replace("import { NoteEditorDialog } from '../notes/NoteEditorDialog';\n", "")
    marker = "const attachmentsRepository = new AttachmentsRepository(notesDatabase);\n"
    if marker not in text:
        raise SystemExit(f"Missing attachments repository marker in {path}")
    lazy_defs = """const ChecklistEditorDialog = lazy(() =>\n  import('../notes/ChecklistEditorDialog').then((module) => ({ default: module.ChecklistEditorDialog })),\n);\nconst NoteEditorDialog = lazy(() =>\n  import('../notes/NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),\n);\n"""
    text = text.replace(marker, marker + lazy_defs, 1)
    # Wrapping the existing editing conditional in Suspense preserves the exact inner behavior.
    start = "      {editing ? (\n"
    if start not in text:
        raise SystemExit(f"Missing editing conditional in {path}")
    text = text.replace(start, "      {editing ? (\n        <Suspense fallback={<span className=\"deferred-note-surface\" role=\"status\">Opening note…</span>}>\n", 1)
    # Find the terminal close of the editing conditional immediately before the lifecycle toast.
    terminal = "      ) : null}\n\n      {toast ? <LifecycleToast"
    if terminal not in text:
        raise SystemExit(f"Missing editing conditional terminator in {path}")
    text = text.replace("      ) : null}\n\n      {toast ? <LifecycleToast", "        </Suspense>\n      ) : null}\n\n      {toast ? <LifecycleToast", 1)
    Path(path).write_text(text)

# PWA: OCR stays local, but is cached on first OCR use instead of blocking every install.
replace_exact(
    "vite.config.ts",
    "        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz}'],\n        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,\n",
    """        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz}'],\n        globIgnores: ['ocr/**/*'],\n        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,\n        runtimeCaching: [\n          {\n            urlPattern: /\\/notes\\/ocr\\//u,\n            handler: 'CacheFirst',\n            options: {\n              cacheName: 'notes-ocr-runtime-v1',\n              cacheableResponse: { statuses: [0, 200] },\n              expiration: {\n                maxEntries: 16,\n                maxAgeSeconds: 365 * 24 * 60 * 60,\n              },\n            },\n          },\n        ],\n""",
)

# We use LSTM-only OCR, so do not copy legacy Tesseract core variants into the deployment.
replace_exact(
    "scripts/prepare-ocr-assets.mjs",
    "  if (!/^tesseract-core(?:-[a-z]+)*(?:-lstm)?\\.wasm(?:\\.js)?$/u.test(fileName)) continue;",
    "  if (!/^tesseract-core(?:-simd)?-lstm\\.wasm(?:\\.js)?$/u.test(fileName)) continue;",
)

# Add a hard performance budget to every production build.
replace_exact(
    "package.json",
    '    "build": "npm run ocr:assets && npm run typecheck && vite build",\n',
    '    "build": "npm run ocr:assets && npm run typecheck && vite build && npm run perf:check",\n    "    \"perf:check\": \"node scripts/check-performance-budget.mjs\",\n',
)

Path("scripts/check-performance-budget.mjs").write_text(r'''import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = join(process.cwd(), 'dist');
const html = await readFile(join(distDir, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/u);
if (!scriptMatch?.[1]) throw new Error('Could not locate the production entry script.');

const entryRelative = scriptMatch[1].replace(/^\/notes\//u, '').replace(/^\.\//u, '');
const entry = await readFile(join(distDir, entryRelative));
const entryBytes = entry.byteLength;
const entryGzipBytes = gzipSync(entry).byteLength;
const maxEntryBytes = 520 * 1024;
const maxEntryGzipBytes = 155 * 1024;

if (entryBytes > maxEntryBytes) {
  throw new Error(`Entry JS ${entryBytes} B exceeds ${maxEntryBytes} B budget.`);
}
if (entryGzipBytes > maxEntryGzipBytes) {
  throw new Error(`Entry JS gzip ${entryGzipBytes} B exceeds ${maxEntryGzipBytes} B budget.`);
}

const sw = await readFile(join(distDir, 'sw.js'), 'utf8');
for (const forbidden of [
  'ocr/lang/eng.traineddata.gz',
  'ocr/lang/deu.traineddata.gz',
  'ocr/lang/fra.traineddata.gz',
  'ocr/core/tesseract-core-simd-lstm.wasm',
]) {
  if (sw.includes(forbidden)) {
    throw new Error(`OCR asset ${forbidden} leaked back into the install-time precache.`);
  }
}

const coreFiles = await readdir(join(distDir, 'ocr', 'core'));
const unexpectedCore = coreFiles.filter((name) => !/-lstm\.wasm(?:\.js)?$/u.test(name));
if (unexpectedCore.length > 0) {
  throw new Error(`Unexpected legacy OCR cores in dist: ${unexpectedCore.join(', ')}`);
}

console.log(
  `[perf] entry ${(entryBytes / 1024).toFixed(1)} KiB (${(entryGzipBytes / 1024).toFixed(1)} KiB gzip); OCR deferred from precache; ${coreFiles.length} LSTM core assets.`,
);
''')

# Small neutral loading states for deferred surfaces.
Path("src/styles/performance.css").write_text(r'''.deferred-workspace-loading,
.deferred-note-surface,
.deferred-composer-tool {
  color: var(--text-subtle);
  font-size: var(--text-xs);
}

.deferred-workspace-loading {
  display: grid;
  min-height: 96px;
  place-items: center;
}

.deferred-note-surface {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(4px);
}

.deferred-composer-tool {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding-inline: 10px;
}
''')
replace_exact(
    "src/styles.css",
    "@import './styles/capture-mobile-polish.css';\n",
    "@import './styles/capture-mobile-polish.css';\n@import './styles/performance.css';\n",
)
