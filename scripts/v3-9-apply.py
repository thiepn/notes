from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if content.count(old) != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {content.count(old)}")
    write(path, content.replace(old, new, 1))


# --- Database v3: metadata-only attachment indexes ---------------------------
write(
    "src/db/migrations/v3.ts",
    """import type Dexie from 'dexie';

import { DATABASE_SCHEMA_V2 } from './v2';

export const DATABASE_VERSION = 3;

export const DATABASE_SCHEMA_V3 = {
  ...DATABASE_SCHEMA_V2,
  attachments:
    'id, noteId, checksum, createdAt, [noteId+name], [noteId+mimeType]',
} as const;

export function applyDatabaseVersion3(database: Dexie): void {
  database.version(DATABASE_VERSION).stores(DATABASE_SCHEMA_V3);
}
""",
)

replace_once(
    "src/db/database.ts",
    "import { applyDatabaseVersion2 } from './migrations/v2';\n",
    "import { applyDatabaseVersion2 } from './migrations/v2';\nimport { applyDatabaseVersion3 } from './migrations/v3';\n",
)
replace_once(
    "src/db/database.ts",
    "    applyDatabaseVersion1(this);\n    applyDatabaseVersion2(this);\n",
    "    applyDatabaseVersion1(this);\n    applyDatabaseVersion2(this);\n    applyDatabaseVersion3(this);\n",
)
replace_once(
    "src/db/index.ts",
    "export { DATABASE_SCHEMA_V2, DATABASE_VERSION } from './migrations/v2';\n",
    "export { DATABASE_SCHEMA_V2 } from './migrations/v2';\nexport { DATABASE_SCHEMA_V3, DATABASE_VERSION } from './migrations/v3';\n",
)

# --- Search: never scan Blob-bearing attachment records ---------------------
path = "src/features/search/searchRepository.ts"
content = read(path)
content = content.replace(
    "    const [rawNotes, rawItems, rawLabels, rawLinks, rawAttachments, rawReminders] =\n      await Promise.all([\n        this.database.notes.toArray(),\n        this.database.checklistItems.toArray(),\n        this.database.labels.toArray(),\n        this.database.noteLabels.toArray(),\n        this.database.attachments.toArray(),\n        this.database.reminders.toArray(),\n      ]);",
    "    const [\n      rawNotes,\n      rawItems,\n      rawLabels,\n      rawLinks,\n      attachmentNameKeys,\n      attachmentMimeKeys,\n      rawReminders,\n    ] = await Promise.all([\n      this.database.notes.toArray(),\n      this.database.checklistItems.toArray(),\n      this.database.labels.toArray(),\n      this.database.noteLabels.toArray(),\n      this.database.attachments.orderBy('[noteId+name]').keys(),\n      this.database.attachments.orderBy('[noteId+mimeType]').keys(),\n      this.database.reminders.toArray(),\n    ]);",
)
content = content.replace(
    "    const imageNoteIds = new Set<string>();\n    const attachmentNamesByNote = new Map<string, string[]>();\n    for (const rawAttachment of rawAttachments) {\n      const attachment = attachmentRecordSchema.parse(rawAttachment);\n      if (!noteIds.has(attachment.noteId)) continue;\n      if (attachment.mimeType.startsWith('image/')) imageNoteIds.add(attachment.noteId);\n      const name = attachment.name?.trim();\n      if (!name) continue;\n      const names = attachmentNamesByNote.get(attachment.noteId) ?? [];\n      names.push(name);\n      attachmentNamesByNote.set(attachment.noteId, names);\n    }",
    "    const imageNoteIds = new Set<string>();\n    const attachmentNamesByNote = new Map<string, string[]>();\n    for (const rawKey of attachmentNameKeys) {\n      const key = compoundStringKey(rawKey);\n      if (!key) continue;\n      const [noteId, rawName] = key;\n      if (!noteIds.has(noteId)) continue;\n      const name = rawName.trim();\n      if (!name) continue;\n      const names = attachmentNamesByNote.get(noteId) ?? [];\n      names.push(name);\n      attachmentNamesByNote.set(noteId, names);\n    }\n    for (const rawKey of attachmentMimeKeys) {\n      const key = compoundStringKey(rawKey);\n      if (!key) continue;\n      const [noteId, mimeType] = key;\n      if (noteIds.has(noteId) && mimeType.startsWith('image/')) imageNoteIds.add(noteId);\n    }",
)
content = content.replace(
    "import {\n  attachmentRecordSchema,\n  checklistItemRecordSchema,",
    "import {\n  checklistItemRecordSchema,",
)
content += """

function compoundStringKey(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second] = value;
  return typeof first === 'string' && typeof second === 'string' ? [first, second] : null;
}
"""
write(path, content)

# --- Backup compatibility across index-only database v3 ---------------------
path = "src/features/backup/backupFormat.ts"
content = read(path)
marker = "export const backupDocumentSchema = z\n  .object({\n    format: z.literal(NOTES_BACKUP_FORMAT),\n    formatVersion: z.literal(NOTES_BACKUP_FORMAT_VERSION),\n    databaseVersion: z.literal(DATABASE_VERSION),\n    exportedAt: timestampSchema,\n    data: backupDataV2Schema,\n  })\n  .strict();\n\n"
if marker not in content:
    raise RuntimeError("backup current schema marker not found")
previous = marker + """const previousBackupDocumentSchema = z
  .object({
    format: z.literal(NOTES_BACKUP_FORMAT),
    formatVersion: z.literal(NOTES_BACKUP_FORMAT_VERSION),
    databaseVersion: z.literal(2),
    exportedAt: timestampSchema,
    data: backupDataV2Schema,
  })
  .strict();

"""
content = content.replace(marker, previous, 1)
content = content.replace(
    "  const current = backupDocumentSchema.safeParse(raw);\n  if (current.success) return current.data;\n\n  const legacy = legacyBackupDocumentSchema.parse(raw);",
    "  const current = backupDocumentSchema.safeParse(raw);\n  if (current.success) return current.data;\n\n  const previous = previousBackupDocumentSchema.safeParse(raw);\n  if (previous.success) {\n    return backupDocumentSchema.parse({ ...previous.data, databaseVersion: DATABASE_VERSION });\n  }\n\n  const legacy = legacyBackupDocumentSchema.parse(raw);",
)
write(path, content)

# --- Storage health / persistence --------------------------------------------
write(
    "src/features/storage/storageHealth.ts",
    """export type StoragePersistence = 'persistent' | 'best-effort' | 'unsupported';

export interface StorageHealth {
  persistence: StoragePersistence;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
  canRequestPersistence: boolean;
}

export async function readStorageHealth(
  manager: StorageManager | null = browserStorageManager(),
): Promise<StorageHealth> {
  if (!manager) {
    return {
      persistence: 'unsupported',
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      canRequestPersistence: false,
    };
  }

  const persisted = await safePersisted(manager);
  const estimate = await safeEstimate(manager);
  const usageBytes = finiteBytes(estimate?.usage);
  const quotaBytes = finiteBytes(estimate?.quota);
  const usageRatio =
    usageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? Math.min(1, usageBytes / quotaBytes)
      : null;

  return {
    persistence: persisted === true ? 'persistent' : 'best-effort',
    usageBytes,
    quotaBytes,
    usageRatio,
    canRequestPersistence: persisted !== true && typeof manager.persist === 'function',
  };
}

export async function requestPersistentStorage(
  manager: StorageManager | null = browserStorageManager(),
): Promise<StorageHealth> {
  if (manager && typeof manager.persist === 'function') {
    try {
      await manager.persist();
    } catch {
      // Storage persistence is a browser policy decision; refresh the observable state either way.
    }
  }
  return readStorageHealth(manager);
}

export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'] as const;
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}

function browserStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined' || !navigator.storage) return null;
  return navigator.storage;
}

async function safePersisted(manager: StorageManager): Promise<boolean | null> {
  if (typeof manager.persisted !== 'function') return null;
  try {
    return await manager.persisted();
  } catch {
    return null;
  }
}

async function safeEstimate(manager: StorageManager): Promise<StorageEstimate | null> {
  if (typeof manager.estimate !== 'function') return null;
  try {
    return await manager.estimate();
  } catch {
    return null;
  }
}

function finiteBytes(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
""",
)

write(
    "src/features/storage/StorageHealthSettings.tsx",
    """import { useCallback, useEffect, useState } from 'react';
import { HardDrive, ShieldCheck } from 'lucide-react';

import {
  formatStorageBytes,
  readStorageHealth,
  requestPersistentStorage,
  type StorageHealth,
} from './storageHealth';

export function StorageHealthSettings() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    setHealth(await readStorageHealth());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const protect = async () => {
    setRequesting(true);
    try {
      setHealth(await requestPersistentStorage());
    } finally {
      setRequesting(false);
    }
  };

  const persistenceCopy =
    health?.persistence === 'persistent'
      ? 'Persistent storage granted. The browser should not evict Notes automatically under storage pressure.'
      : health?.persistence === 'best-effort'
        ? 'Best-effort storage. The browser may evict local data under storage pressure.'
        : 'This browser does not expose persistent-storage status.';
  const usageCopy = health
    ? `${formatStorageBytes(health.usageBytes)} used${
        health.quotaBytes === null ? '' : ` of about ${formatStorageBytes(health.quotaBytes)}`
      }.`
    : 'Checking browser storage…';

  return (
    <section className="settings-group" aria-label="Local storage health">
      <div className="settings-group-copy">
        <strong>Local storage health</strong>
        <span>Notes is local-first, so browser-storage durability is part of data safety.</span>
      </div>
      <div className="settings-setting-row">
        <span className="settings-row-icon" aria-hidden="true">
          {health?.persistence === 'persistent' ? <ShieldCheck /> : <HardDrive />}
        </span>
        <span>
          <strong>
            {health?.persistence === 'persistent'
              ? 'Persistent local storage'
              : health?.persistence === 'best-effort'
                ? 'Best-effort local storage'
                : 'Local browser storage'}
          </strong>
          <small>{persistenceCopy}</small>
          <small>{usageCopy}</small>
        </span>
        {health?.canRequestPersistence ? (
          <button type="button" disabled={requesting} onClick={() => void protect()}>
            {requesting ? 'Requesting…' : 'Protect storage'}
          </button>
        ) : (
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        )}
      </div>
      <p className="settings-note">
        Persistent storage reduces automatic browser eviction; it does not prevent manual browser-data
        clearing. Keep full backups for disaster recovery.
      </p>
    </section>
  );
}
""",
)

write(
    "src/features/storage/storageHealth.test.ts",
    """import { describe, expect, it } from 'vitest';

import { formatStorageBytes, readStorageHealth } from './storageHealth';

describe('storage health', () => {
  it('formats storage estimates compactly', () => {
    expect(formatStorageBytes(null)).toBe('Unknown');
    expect(formatStorageBytes(1024)).toBe('1.00 KiB');
    expect(formatStorageBytes(25 * 1024 * 1024)).toBe('25.0 MiB');
  });

  it('reports persistence and quota without mutating storage', async () => {
    const manager = {
      persisted: async () => true,
      estimate: async () => ({ usage: 25, quota: 100 }),
      persist: async () => true,
    } as unknown as StorageManager;
    await expect(readStorageHealth(manager)).resolves.toEqual({
      persistence: 'persistent',
      usageBytes: 25,
      quotaBytes: 100,
      usageRatio: 0.25,
      canRequestPersistence: false,
    });
  });
});
""",
)

# Settings gets storage health in the deferred Settings chunk.
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "import { useTheme } from '../../theme/ThemeContext';\n",
    "import { StorageHealthSettings } from '../storage/StorageHealthSettings';\nimport { useTheme } from '../../theme/ThemeContext';\n",
)
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "            {section === 'advanced' ? (\n              <>\n                <section className=\"settings-group\" aria-label=\"Backup and import\">",
    "            {section === 'advanced' ? (\n              <>\n                <StorageHealthSettings />\n                <section className=\"settings-group\" aria-label=\"Backup and import\">",
)

# --- Shared view mode and explicit capture/search coordination ---------------
replace_once(
    "src/app/AppShell.tsx",
    "import { NotesWorkspace } from '../features/notes/NotesWorkspace';\n",
    "import { NotesWorkspace, type CaptureRequest } from '../features/notes/NotesWorkspace';\nimport { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../features/notes/viewMode';\n",
)
replace_once(
    "src/app/AppShell.tsx",
    "  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);\n",
    "  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);\n  const [searchFocusRequest, setSearchFocusRequest] = useState(0);\n  const [captureRequest, setCaptureRequest] = useState<CaptureRequest | null>(null);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());\n",
)
replace_once(
    "src/app/AppShell.tsx",
    "  const prepareNotesCapture = useCallback(\n    (kind: 'text' | 'checklist') => {\n      clearSearch();\n      setCommandPaletteOpen(false);\n      if (activeSection !== 'notes') {\n        setActiveSection('notes');\n        setActiveLabelId(null);\n        persistActiveSection('notes');\n        persistActiveLabelId(null);\n      }\n\n      afterUiUpdate(() => {\n        const selector =\n          kind === 'text'\n            ? 'button[aria-label=\"Create a text note\"]'\n            : 'button[aria-label=\"Create a checklist\"]';\n        document.querySelector<HTMLButtonElement>(selector)?.click();\n      });\n    },\n    [activeSection, clearSearch],\n  );\n\n  const focusSearch = useCallback(() => {\n    setCommandPaletteOpen(false);\n    afterUiUpdate(() => {\n      document.querySelector<HTMLInputElement>('input[aria-label=\"Search notes\"]')?.focus();\n    });\n  }, []);\n\n  const openLabelManager = useCallback(() => {\n    setCommandPaletteOpen(false);\n    setLabelManagerOpen(true);\n    afterUiUpdate(() => {\n      document.querySelector<HTMLInputElement>('input[aria-label=\"New label name\"]')?.focus();\n    });\n  }, []);\n\n  const setViewModeFromCommand = useCallback((view: 'grid' | 'list') => {\n    setCommandPaletteOpen(false);\n    afterUiUpdate(() => {\n      document\n        .querySelector<HTMLButtonElement>(\n          `button[aria-label=\"${view === 'grid' ? 'Grid' : 'List'} view\"]`,\n        )\n        ?.click();\n    });\n  }, []);",
    "  const prepareNotesCapture = useCallback(\n    (kind: 'text' | 'checklist') => {\n      clearSearch();\n      setCommandPaletteOpen(false);\n      setActiveSection('notes');\n      setActiveLabelId(null);\n      persistActiveSection('notes');\n      persistActiveLabelId(null);\n      setCaptureRequest((current) => ({ id: (current?.id ?? 0) + 1, kind }));\n    },\n    [clearSearch],\n  );\n\n  const focusSearch = useCallback(() => {\n    setCommandPaletteOpen(false);\n    setSearchFocusRequest((request) => request + 1);\n  }, []);\n\n  const openLabelManager = useCallback(() => {\n    setCommandPaletteOpen(false);\n    setLabelManagerOpen(true);\n  }, []);\n\n  const handleViewMode = useCallback((view: NotesViewMode) => {\n    setViewMode(view);\n    writeNotesViewMode(view);\n  }, []);\n\n  const setViewModeFromCommand = useCallback(\n    (view: NotesViewMode) => {\n      setCommandPaletteOpen(false);\n      handleViewMode(view);\n    },\n    [handleViewMode],\n  );",
)
replace_once(
    "src/app/AppShell.tsx",
    "        onSettings={() => setSettingsOpen(true)}\n        searchQuery={searchQuery}",
    "        onSettings={() => setSettingsOpen(true)}\n        onViewModeChange={handleViewMode}\n        searchFocusRequest={searchFocusRequest}\n        searchQuery={searchQuery}",
)
replace_once(
    "src/app/AppShell.tsx",
    "                <SearchWorkspace\n                  query={searchQuery}",
    "                <SearchWorkspace\n                  query={searchQuery}\n                  viewMode={viewMode}\n                  onViewModeChange={handleViewMode}",
)
replace_once(
    "src/app/AppShell.tsx",
    "                <RemindersWorkspace labels={labels} />",
    "                <RemindersWorkspace\n                  labels={labels}\n                  viewMode={viewMode}\n                  onViewModeChange={handleViewMode}\n                />",
)
replace_once(
    "src/app/AppShell.tsx",
    "              <NotesWorkspace\n                mode={activeLabel ? 'notes' : activeSection}\n                labels={labels}\n                filterLabelId={activeLabel?.id ?? null}\n                onCollectionChanged={() => void refreshNavigationStats()}\n              />",
    "              <NotesWorkspace\n                mode={activeLabel ? 'notes' : activeSection}\n                labels={labels}\n                filterLabelId={activeLabel?.id ?? null}\n                viewMode={viewMode}\n                onViewModeChange={handleViewMode}\n                captureRequest={captureRequest}\n                onCaptureRequestHandled={(requestId) =>\n                  setCaptureRequest((current) => (current?.id === requestId ? null : current))\n                }\n                onCollectionChanged={() => void refreshNavigationStats()}\n              />",
)

# Header no longer reaches into another component's DOM.
replace_once(
    "src/components/AppHeader.tsx",
    "  onSettings(): void;\n  searchQuery: string;",
    "  onSettings(): void;\n  onViewModeChange(view: 'grid' | 'list'): void;\n  searchFocusRequest: number;\n  searchQuery: string;",
)
replace_once(
    "src/components/AppHeader.tsx",
    "  onSettings,\n  searchQuery,",
    "  onSettings,\n  onViewModeChange,\n  searchFocusRequest,\n  searchQuery,",
)
replace_once(
    "src/components/AppHeader.tsx",
    "  const clickViewButton = (label: 'Grid view' | 'List view') => {\n    document.querySelector<HTMLButtonElement>(`button[aria-label=\"${label}\"]`)?.click();\n    setMoreOpen(false);\n  };\n",
    "  useEffect(() => {\n    if (searchFocusRequest <= 0) return;\n    searchInputRef.current?.focus();\n  }, [searchFocusRequest]);\n\n  const chooseView = (view: 'grid' | 'list') => {\n    onViewModeChange(view);\n    setMoreOpen(false);\n  };\n",
)
replace_once(
    "src/components/AppHeader.tsx",
    "            <button type=\"button\" role=\"menuitem\" onClick={() => clickViewButton('Grid view')}>\n",
    "            <button type=\"button\" role=\"menuitem\" onClick={() => chooseView('grid')}>\n",
)
replace_once(
    "src/components/AppHeader.tsx",
    "            <button type=\"button\" role=\"menuitem\" onClick={() => clickViewButton('List view')}>\n",
    "            <button type=\"button\" role=\"menuitem\" onClick={() => chooseView('list')}>\n",
)

# Notes workspace becomes controlled for view mode and capture requests.
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from './viewMode';\n",
    "import type { NotesViewMode } from './viewMode';\n",
)
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "interface NotesWorkspaceProps {\n  mode?: NoteCollectionMode;\n  labels: LabelRecord[];\n  filterLabelId?: string | null;\n  onCollectionChanged?: () => void;\n}\n",
    "export interface CaptureRequest {\n  id: number;\n  kind: 'text' | 'checklist';\n}\n\ninterface NotesWorkspaceProps {\n  mode?: NoteCollectionMode;\n  labels: LabelRecord[];\n  filterLabelId?: string | null;\n  viewMode: NotesViewMode;\n  onViewModeChange(view: NotesViewMode): void;\n  captureRequest?: CaptureRequest | null;\n  onCaptureRequestHandled?(requestId: number): void;\n  onCollectionChanged?: () => void;\n}\n",
)
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "  filterLabelId = null,\n  onCollectionChanged,\n}: NotesWorkspaceProps) {",
    "  filterLabelId = null,\n  viewMode,\n  onViewModeChange,\n  captureRequest = null,\n  onCaptureRequestHandled,\n  onCollectionChanged,\n}: NotesWorkspaceProps) {",
)
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());\n",
    "  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);\n  const [textCaptureRequestId, setTextCaptureRequestId] = useState<number | undefined>(undefined);\n",
)
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "  const handleViewMode = useCallback((nextMode: NotesViewMode) => {\n    setViewMode(nextMode);\n    writeNotesViewMode(nextMode);\n  }, []);\n",
    "  useEffect(() => {\n    if (!captureRequest || mode !== 'notes') return;\n    if (captureRequest.kind === 'checklist') {\n      setTextCaptureRequestId(undefined);\n      setChecklistCaptureOpen(true);\n    } else {\n      setChecklistCaptureOpen(false);\n      setTextCaptureRequestId(captureRequest.id);\n    }\n    onCaptureRequestHandled?.(captureRequest.id);\n  }, [captureRequest, mode, onCaptureRequestHandled]);\n",
)
replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    "          <TextNoteComposer\n            repository={notesRepository}",
    "          <TextNoteComposer\n            openRequestId={textCaptureRequestId}\n            repository={notesRepository}",
)
content = read("src/features/notes/NotesWorkspace.tsx").replace("onClick={() => handleViewMode('grid')}", "onClick={() => onViewModeChange('grid')}").replace("onClick={() => handleViewMode('list')}", "onClick={() => onViewModeChange('list')}")
write("src/features/notes/NotesWorkspace.tsx", content)

# Text composer accepts a declarative open request.
replace_once(
    "src/features/notes/TextNoteComposer.tsx",
    "interface TextNoteComposerProps {\n  repository: NotesRepository;",
    "interface TextNoteComposerProps {\n  openRequestId?: number;\n  repository: NotesRepository;",
)
replace_once(
    "src/features/notes/TextNoteComposer.tsx",
    "export function TextNoteComposer({\n  repository,",
    "export function TextNoteComposer({\n  openRequestId,\n  repository,",
)
replace_once(
    "src/features/notes/TextNoteComposer.tsx",
    "  const composerRef = useRef<HTMLDivElement>(null);\n",
    "  const composerRef = useRef<HTMLDivElement>(null);\n  const lastOpenRequestIdRef = useRef<number | undefined>(undefined);\n",
)
replace_once(
    "src/features/notes/TextNoteComposer.tsx",
    "  useEffect(() => {\n    onActiveNoteChange(activeNoteId);\n  }, [activeNoteId, onActiveNoteChange]);\n",
    "  useEffect(() => {\n    onActiveNoteChange(activeNoteId);\n  }, [activeNoteId, onActiveNoteChange]);\n\n  useEffect(() => {\n    if (openRequestId === undefined || lastOpenRequestIdRef.current === openRequestId) return;\n    lastOpenRequestIdRef.current = openRequestId;\n    openCapture();\n  }, [openCapture, openRequestId]);\n",
)

# Search workspace controlled view mode.
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';\n",
    "import type { NotesViewMode } from '../notes/viewMode';\n",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "interface SearchWorkspaceProps {\n  query: string;",
    "interface SearchWorkspaceProps {\n  query: string;\n  viewMode: NotesViewMode;\n  onViewModeChange(view: NotesViewMode): void;",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "  query,\n  filters,",
    "  query,\n  viewMode,\n  onViewModeChange,\n  filters,",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "  const [loaded, setLoaded] = useState(false);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());\n",
    "  const [loaded, setLoaded] = useState(false);\n",
)
replace_once(
    "src/features/search/SearchWorkspace.tsx",
    "  const handleViewMode = useCallback((nextMode: NotesViewMode) => {\n    setViewMode(nextMode);\n    writeNotesViewMode(nextMode);\n  }, []);\n\n",
    "",
)
content = read("src/features/search/SearchWorkspace.tsx").replace("onClick={() => handleViewMode('grid')}", "onClick={() => onViewModeChange('grid')}").replace("onClick={() => handleViewMode('list')}", "onClick={() => onViewModeChange('list')}")
write("src/features/search/SearchWorkspace.tsx", content)

# Reminders workspace controlled view mode.
replace_once(
    "src/features/reminders/RemindersWorkspace.tsx",
    "import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';\n",
    "import type { NotesViewMode } from '../notes/viewMode';\n",
)
replace_once(
    "src/features/reminders/RemindersWorkspace.tsx",
    "interface RemindersWorkspaceProps {\n  labels: LabelRecord[];\n}\n",
    "interface RemindersWorkspaceProps {\n  labels: LabelRecord[];\n  viewMode: NotesViewMode;\n  onViewModeChange(view: NotesViewMode): void;\n}\n",
)
replace_once(
    "src/features/reminders/RemindersWorkspace.tsx",
    "export function RemindersWorkspace({ labels }: RemindersWorkspaceProps) {",
    "export function RemindersWorkspace({\n  labels,\n  viewMode,\n  onViewModeChange,\n}: RemindersWorkspaceProps) {",
)
replace_once(
    "src/features/reminders/RemindersWorkspace.tsx",
    "  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());\n",
    "  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);\n",
)
replace_once(
    "src/features/reminders/RemindersWorkspace.tsx",
    "  const handleViewMode = (next: NotesViewMode) => {\n    setViewMode(next);\n    writeNotesViewMode(next);\n  };\n\n",
    "",
)
content = read("src/features/reminders/RemindersWorkspace.tsx").replace("onClick={() => handleViewMode('grid')}", "onClick={() => onViewModeChange('grid')}").replace("onClick={() => handleViewMode('list')}", "onClick={() => onViewModeChange('list')}")
write("src/features/reminders/RemindersWorkspace.tsx", content)

# Label manager owns its own initial focus instead of AppShell querying its DOM.
replace_once(
    "src/features/notes/LabelManagerDialog.tsx",
    "import { useEffect, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';",
    "import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';",
)

# --- Reusable dialog focus containment ---------------------------------------
write(
    "src/components/ui/useDialogFocusTrap.ts",
    """import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogFocusOptions<TInitial extends HTMLElement> {
  onEscape?: () => void;
  initialFocusRef?: RefObject<TInitial | null>;
}

export function useDialogFocusTrap<
  TContainer extends HTMLElement,
  TInitial extends HTMLElement = HTMLElement,
>(
  containerRef: RefObject<TContainer | null>,
  options: DialogFocusOptions<TInitial> = {},
): void {
  const onEscapeRef = useRef(options.onEscape);
  onEscapeRef.current = options.onEscape;
  const initialFocusRef = options.initialFocusRef;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
      target.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      const index = focusable.findIndex((element) => element === active);
      if (event.shiftKey && (index <= 0 || !container.contains(active))) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previous?.isConnected) window.requestAnimationFrame(() => previous.focus());
    };
  }, [containerRef, initialFocusRef]);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && element.getClientRects().length > 0,
  );
}
""",
)

# Settings: replace bespoke Escape/focus effect with shared focus trap.
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "import { useEffect, useRef, useState } from 'react';\n",
    "import { useRef, useState } from 'react';\n",
)
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "import { usePrivacy } from '../privacy/PrivacyContext';\n",
    "import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';\nimport { usePrivacy } from '../privacy/PrivacyContext';\n",
)
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "  const closeRef = useRef<HTMLButtonElement>(null);\n",
    "  const dialogRef = useRef<HTMLElement>(null);\n  const closeRef = useRef<HTMLButtonElement>(null);\n",
)
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "  useEffect(() => {\n    closeRef.current?.focus();\n    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key !== 'Escape') return;\n      event.preventDefault();\n      onClose();\n    };\n    window.addEventListener('keydown', handleKeyDown);\n    return () => window.removeEventListener('keydown', handleKeyDown);\n  }, [onClose]);\n",
    "  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: closeRef });\n",
)
replace_once(
    "src/features/settings/SettingsDialog.tsx",
    "      <section\n        className=\"settings-dialog\"",
    "      <section\n        ref={dialogRef}\n        tabIndex={-1}\n        className=\"settings-dialog\"",
)

# Privacy dialog focus trap.
replace_once(
    "src/features/privacy/PrivacySettingsDialog.tsx",
    "import { useEffect, useState } from 'react';\n",
    "import { useRef, useState } from 'react';\n",
)
replace_once(
    "src/features/privacy/PrivacySettingsDialog.tsx",
    "import { clearRecentSearches } from '../search/searchHistory';\n",
    "import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';\nimport { clearRecentSearches } from '../search/searchHistory';\n",
)
replace_once(
    "src/features/privacy/PrivacySettingsDialog.tsx",
    "  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n\n  useEffect(() => {\n    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') onClose();\n    };\n    window.addEventListener('keydown', handleKeyDown);\n    return () => window.removeEventListener('keydown', handleKeyDown);\n  }, [onClose]);\n",
    "  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n  const dialogRef = useRef<HTMLElement>(null);\n\n  useDialogFocusTrap(dialogRef, { onEscape: onClose });\n",
)
replace_once(
    "src/features/privacy/PrivacySettingsDialog.tsx",
    "      <section\n        className=\"privacy-dialog\"",
    "      <section\n        ref={dialogRef}\n        tabIndex={-1}\n        className=\"privacy-dialog\"",
)

# Label manager focus trap and initial-focus ownership.
replace_once(
    "src/features/notes/LabelManagerDialog.tsx",
    "import { IconButton } from '../../components/ui/IconButton';\n",
    "import { IconButton } from '../../components/ui/IconButton';\nimport { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';\n",
)
replace_once(
    "src/features/notes/LabelManagerDialog.tsx",
    "  const [busy, setBusy] = useState(false);\n\n  useEffect(() => {\n    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') onClose();\n    };\n    window.addEventListener('keydown', handleKeyDown);\n    return () => window.removeEventListener('keydown', handleKeyDown);\n  }, [onClose]);\n",
    "  const [busy, setBusy] = useState(false);\n  const dialogRef = useRef<HTMLDivElement>(null);\n  const newLabelRef = useRef<HTMLInputElement>(null);\n\n  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: newLabelRef });\n",
)
replace_once(
    "src/features/notes/LabelManagerDialog.tsx",
    "      <div\n        className=\"label-manager-dialog\"",
    "      <div\n        ref={dialogRef}\n        tabIndex={-1}\n        className=\"label-manager-dialog\"",
)
replace_once(
    "src/features/notes/LabelManagerDialog.tsx",
    "          <input\n            type=\"text\"",
    "          <input\n            ref={newLabelRef}\n            type=\"text\"",
)

# Command palette also gets Tab containment and focus restoration.
replace_once(
    "src/features/commands/CommandPalette.tsx",
    "import { Command, Search } from 'lucide-react';\n",
    "import { Command, Search } from 'lucide-react';\n\nimport { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';\n",
)
replace_once(
    "src/features/commands/CommandPalette.tsx",
    "  const inputRef = useRef<HTMLInputElement>(null);\n",
    "  const dialogRef = useRef<HTMLDivElement>(null);\n  const inputRef = useRef<HTMLInputElement>(null);\n",
)
replace_once(
    "src/features/commands/CommandPalette.tsx",
    "  useEffect(() => {\n    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());\n    return () => window.cancelAnimationFrame(frame);\n  }, []);\n",
    "  useDialogFocusTrap(dialogRef, { initialFocusRef: inputRef });\n",
)
replace_once(
    "src/features/commands/CommandPalette.tsx",
    "      <div\n        className=\"command-palette\"",
    "      <div\n        ref={dialogRef}\n        tabIndex={-1}\n        className=\"command-palette\"",
)
# remove now-unused useEffect import from CommandPalette
replace_once(
    "src/features/commands/CommandPalette.tsx",
    "  useEffect,\n",
    "",
)

# --- Scale regression guards --------------------------------------------------
write(
    "src/features/search/searchScale.test.ts",
    """import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  normalizeSearchText,
  searchDocuments,
  tokenizeNormalizedSearchText,
  type SearchDocument,
} from './searchEngine';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

function document(index: number): SearchDocument {
  const title = index === 9_999 ? 'Missionary preparation needle' : `Library note ${index}`;
  const body = `Reference material ${index} weekly planning ordinary text`;
  const normalizedTitle = normalizeSearchText(title);
  const normalizedBody = normalizeSearchText(body);
  const titleTokens = tokenizeNormalizedSearchText(normalizedTitle);
  const bodyTokens = tokenizeNormalizedSearchText(normalizedBody);
  const note: NoteRecord = {
    id: `scale-note-${index}`,
    type: 'text',
    title,
    content: body,
    color: 'default',
    createdAt: index,
    updatedAt: index,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: index,
    revision: 1,
  };
  return {
    note,
    checklistItems: [],
    labelIds: [],
    labelNames: [],
    attachmentNames: [],
    ocrText: '',
    hasImage: false,
    hasLink: false,
    hasReminder: false,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist: '',
    normalizedLabels: '',
    normalizedAttachments: '',
    normalizedOcr: '',
    normalizedAll: `${normalizedTitle} ${normalizedBody}`,
    titleTokens,
    bodyTokens,
    checklistTokens: [],
    labelTokens: [],
    attachmentTokens: [],
    ocrTokens: [],
    allTokens: [...new Set([...titleTokens, ...bodyTokens])],
  };
}

describe('large-library search budget', () => {
  it('keeps a 10,000-note fuzzy search within the interactive budget', () => {
    const documents = Array.from({ length: 10_000 }, (_, index) => document(index));
    const started = performance.now();
    const results = searchDocuments(documents, 'misionary', DEFAULT_SEARCH_FILTERS);
    const elapsed = performance.now() - started;
    expect(results.map((result) => result.document.note.id)).toEqual(['scale-note-9999']);
    expect(elapsed).toBeLessThan(1_500);
  });
});
""",
)

write(
    "e2e/scale-storage-hardening.spec.ts",
    """import { expect, test } from '@playwright/test';

test('search uses attachment metadata indexes without requiring attachment table scans', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  const indexes = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const note = await notes.create({ title: 'Indexed attachment note', content: 'metadata only' });
    await db.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: note.id,
      name: 'massive-reference-photo.jpg',
      mimeType: 'image/jpeg',
      size: 4,
      checksum: 'scale-checksum',
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
      createdAt: Date.now(),
    });
    const table = db.notesDatabase.attachments as typeof db.notesDatabase.attachments & {
      toArray: () => Promise<never>;
    };
    table.toArray = async () => {
      throw new Error('Search must not scan Blob-bearing attachment rows.');
    };
    return db.notesDatabase.attachments.schema.indexes.map((index) => index.name);
  });

  expect(indexes).toContain('[noteId+name]');
  expect(indexes).toContain('[noteId+mimeType]');

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('massive reference photo');
  await expect(page.getByText('Attachment · massive-reference-photo.jpg')).toBeVisible();
});

test('settings exposes local storage health and keeps keyboard focus inside the dialog', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await expect(settings.getByText('Local storage health')).toBeVisible();

  for (let index = 0; index < 20; index += 1) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);
});
""",
)

# Performance gate now prevents the exact attachment-scan regression.
replace_once(
    "scripts/check-performance-budget.mjs",
    "const sw = await readFile(join(distDir, 'sw.js'), 'utf8');\n",
    "const searchRepository = await readFile(\n  join(cwd(), 'src', 'features', 'search', 'searchRepository.ts'),\n  'utf8',\n);\nif (/attachments\\.toArray\\(\\)/u.test(searchRepository)) {\n  throw new Error('Search must not materialize Blob-bearing attachment rows.');\n}\nif (\n  !searchRepository.includes(\"orderBy('[noteId+name]').keys()\") ||\n  !searchRepository.includes(\"orderBy('[noteId+mimeType]').keys()\")\n) {\n  throw new Error('Search attachment metadata indexes are missing from the production source.');\n}\n\nconst sw = await readFile(join(distDir, 'sw.js'), 'utf8');\n",
)

# --- Documentation: make the current product contract truthful ---------------
write(
    "docs/PRODUCT.md",
    """# Current Product Contract

## Product statement

Notes is a local-first, zero-friction notes application for `thiepn.dev/notes/`. It aims to preserve Google Keep's capture speed while improving local ownership, recovery, portability, search, privacy controls, and desktop ergonomics.

## Core product

- Text notes and checklists with automatic saving
- Pinning, colors, labels, archive, trash, grid/list views, and bulk actions
- Fast local search with filters, operators, saved searches, attachment-name indexing, OCR text indexing, and typo tolerance
- Image/file attachments, voice recordings, drawings, and optional local OCR
- Note links/connections and revision history
- Reminders with optional best-effort browser notifications
- Full backup/restore plus Markdown/JSON export and Google Keep Takeout import
- Offline-first PWA behavior
- Responsive desktop, tablet, and mobile UX
- Device-local privacy controls and optional UI privacy lock

## Deliberate exclusions

- Cloud sync
- Accounts and server authentication
- Collaboration
- Server-side AI features
- Nested folders
- Notion-style databases
- Project-management systems
- Plugin systems
- Claims of encryption at rest or end-to-end encryption

## Product rules

1. Capture is always one interaction away.
2. Notes auto-save; normal editing has no save button.
3. Organization remains shallow and optional.
4. Search must make heavy organization unnecessary.
5. Local data integrity is a release blocker.
6. Core workflows must work without a network connection.
7. User data must remain exportable in open formats.
8. Advanced features may not increase core capture friction.
9. Local-only storage durability and backup health are product responsibilities, not implementation details.
10. Scale regressions in search, rendering, attachments, or backups must be treated as reliability defects.

## Release hierarchy

1. Capture quality
2. Data integrity and storage durability
3. Retrieval
4. Portability and recovery
5. Responsive/polished interaction
6. Performance at realistic library scale
7. Advanced features
""",
)

path = "docs/ARCHITECTURE.md"
content = read(path)
content = content.replace(
    "A full backup contains all seven database-v1 tables: notes, checklist items, labels, note-label relationships, attachments, revisions, and settings.",
    "A full backup contains all eight current durable tables: notes, checklist items, labels, note-label relationships, attachments, reminders, revisions, and settings.",
)
content = content.replace(
    "The replacement itself is one seven-table IndexedDB transaction. Table clears and inserts commit together; any write error aborts the transaction and restores the previous local library.",
    "The replacement itself is one eight-table IndexedDB transaction. Table clears and inserts commit together; any write error aborts the transaction and restores the previous local library.",
)
content = content.replace(
    "The migration itself is one read-write transaction spanning all seven durable tables. New notes, checklist items, normalized labels, relationships, attachments, initial P11 `import` revisions, and source-ledger rows commit together.",
    "The migration itself is one read-write transaction spanning the durable tables it changes. New notes, checklist items, normalized labels, relationships, attachments, reminders when present, initial P11 `import` revisions, and source-ledger rows commit together.",
)
content += """

## Scale and storage hardening boundary

V3.9 treats browser-storage durability and large-library behavior as first-class reliability concerns.

Database version 3 keeps the attachment record format unchanged but adds `[noteId+name]` and `[noteId+mimeType]` compound indexes. Search reads those index keys instead of loading Blob-bearing attachment rows merely to discover filenames or image presence. Because the record shape is unchanged, V3.9 does not rewrite attachment bytes and existing backup payloads remain structurally compatible. Backup format v2 files created against database version 2 are normalized to database version 3 during validation.

The Settings → Data & advanced surface reports best-effort versus persistent browser storage and quota estimates when the Storage API is available. Persistence is requested only through an explicit user action. Persistent storage reduces automatic eviction risk but cannot protect against manual site-data clearing, so full backups remain the disaster-recovery boundary.

Grid/list view state is now coordinated by AppShell and passed explicitly to active workspaces. Global capture and search-focus requests are also represented as React state instead of locating rendered controls by accessible-name selectors. Focused-card keyboard commands remain DOM-aware because their target is intentionally the currently focused rendered card.

Custom global dialogs use a shared focus-containment hook for Tab cycling, Escape handling where appropriate, initial focus, and focus restoration. This keeps overlay accessibility behavior consistent without adding a UI-framework dependency.
"""
write(path, content)

write(
    "docs/SCALE_AND_STORAGE.md",
    """# Scale, Storage & Architecture Hardening — V3.9

## Goals

V3.9 adds no major end-user capability. It hardens the existing local-first product against larger libraries, browser storage eviction, brittle global UI coordination, and modal accessibility regressions.

## Attachment-aware search without Blob scans

Attachment records continue to store their Blob payload in IndexedDB. Database v3 adds two metadata compound indexes:

- `[noteId+name]`
- `[noteId+mimeType]`

Search uses index-key cursors for attachment filenames and image-presence detection. It therefore does not call `attachments.toArray()` while constructing the search document index. A production performance gate fails if that full-row scan is reintroduced.

## Storage durability

Settings → Data & advanced exposes browser storage health where supported:

- persistent vs best-effort retention;
- estimated usage;
- estimated quota;
- an explicit request for persistent storage when the browser supports it.

This is advisory browser state. Persistent storage reduces automatic eviction risk but cannot prevent a user/browser-admin from explicitly clearing site data. Full backup remains mandatory disaster recovery.

## Large-library regression budget

The unit suite contains a deterministic 10,000-note fuzzy-search budget. The existing production entry-JS and PWA/OCR precache budgets remain release gates. Browser E2E also verifies that attachment search works when `attachments.toArray()` is deliberately disabled at runtime.

## UI architecture

The following global interactions are coordinated explicitly through React state/props:

- text/checklist capture requests;
- search focus requests;
- grid/list view preference.

This removes reliance on querying another component by ARIA label and programmatically clicking it. DOM traversal remains limited to interactions whose semantic target is inherently the currently focused note card.

## Dialog accessibility

Settings, privacy settings, label management, and the command palette share one focus-containment utility. It cycles Tab within the active dialog, supports initial focus and restoration, and centralizes Escape handling for dialogs that delegate Escape to the hook.
""",
)

print('V3.9 patch applied')
