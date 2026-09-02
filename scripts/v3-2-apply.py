from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"Expected {expected} matches in {path}, found {count}: {old[:120]!r}"
        )
    file.write_text(text.replace(old, new))


# --- Search engine: expose the strongest matching field so retrieval UI can explain matches. ---
replace_exact(
    "src/features/search/searchEngine.ts",
    "export interface SearchResult {\n  document: SearchDocument;\n  score: number;\n}\n",
    "export interface SearchResult {\n  document: SearchDocument;\n  score: number;\n}\n\nexport type SearchMatchField =\n  | 'title'\n  | 'label'\n  | 'attachment'\n  | 'ocr'\n  | 'checklist'\n  | 'body';\n",
)
replace_exact(
    "src/features/search/searchEngine.ts",
    "function scoreDocument(\n  document: SearchDocument,\n  terms: string[],\n  normalizedFreeQuery: string,\n): number | null {",
    "export function primarySearchMatchField(\n  document: SearchDocument,\n  query: string,\n): SearchMatchField | null {\n  const terms = parseSearchQuery(query).terms;\n  if (terms.length === 0) return null;\n\n  const candidates: Array<{\n    field: SearchMatchField;\n    normalized: string;\n    tokens: string[];\n    weights: FieldWeights;\n  }> = [\n    { field: 'title', normalized: document.normalizedTitle, tokens: document.titleTokens, weights: TITLE_WEIGHTS },\n    { field: 'label', normalized: document.normalizedLabels, tokens: document.labelTokens, weights: LABEL_WEIGHTS },\n    { field: 'attachment', normalized: document.normalizedAttachments, tokens: document.attachmentTokens, weights: ATTACHMENT_WEIGHTS },\n    { field: 'ocr', normalized: document.normalizedOcr, tokens: document.ocrTokens, weights: OCR_WEIGHTS },\n    { field: 'checklist', normalized: document.normalizedChecklist, tokens: document.checklistTokens, weights: CHECKLIST_WEIGHTS },\n    { field: 'body', normalized: document.normalizedBody, tokens: document.bodyTokens, weights: BODY_WEIGHTS },\n  ];\n\n  let best: { field: SearchMatchField; matched: number; score: number } | null = null;\n  for (const candidate of candidates) {\n    let matched = 0;\n    let score = 0;\n    for (const term of terms) {\n      const termScore = scoreField(term, candidate.normalized, candidate.tokens, candidate.weights);\n      if (termScore <= 0) continue;\n      matched += 1;\n      score += termScore;\n    }\n    if (matched === 0) continue;\n    if (!best || matched > best.matched || (matched === best.matched && score > best.score)) {\n      best = { field: candidate.field, matched, score };\n    }\n  }\n\n  return best?.field ?? null;\n}\n\nfunction scoreDocument(\n  document: SearchDocument,\n  terms: string[],\n  normalizedFreeQuery: string,\n): number | null {",
)

# --- Header: staged Escape, ArrowDown bridge, filter count, and search keyboard metadata. ---
replace_exact(
    "src/components/AppHeader.tsx",
    "  const currentIsSaved = savedSearches.some(\n    (search) => searchSignature(search) === currentSignature,\n  );\n",
    "  const currentIsSaved = savedSearches.some(\n    (search) => searchSignature(search) === currentSignature,\n  );\n  const historyVisible =\n    searchHistoryOpen && !searchQuery.trim() && !filtersActive && !filtersOpen;\n  const activeFilterCount =\n    (searchFilters.type !== 'any' ? 1 : 0) +\n    (searchFilters.status !== 'any' ? 1 : 0) +\n    searchFilters.colors.length +\n    searchFilters.labelIds.length +\n    (searchFilters.after ? 1 : 0) +\n    (searchFilters.before ? 1 : 0);\n",
)
replace_exact(
    "src/components/AppHeader.tsx",
    "          placeholder=\"Search notes\"\n          aria-label=\"Search notes\"\n          value={searchQuery}\n          onChange={(event) => onSearchQueryChange(event.target.value)}\n          onKeyDown={(event) => {\n            if (event.key === 'Escape' && searchQuery) {\n              event.preventDefault();\n              onSearchQueryChange('');\n            }\n          }}",
    "          placeholder=\"Search notes\"\n          aria-label=\"Search notes\"\n          aria-keyshortcuts=\"/\"\n          enterKeyHint=\"search\"\n          value={searchQuery}\n          onChange={(event) => onSearchQueryChange(event.target.value)}\n          onKeyDown={(event) => {\n            if (event.key === 'ArrowDown') {\n              const target = historyVisible\n                ? document.querySelector<HTMLButtonElement>(\n                    '.search-history-popover .search-history-apply',\n                  )\n                : document.querySelector<HTMLButtonElement>(\n                    '.search-result-section .note-card-open',\n                  );\n              if (target) {\n                event.preventDefault();\n                target.focus();\n              }\n              return;\n            }\n\n            if (event.key !== 'Escape') return;\n            if (historyVisible) {\n              event.preventDefault();\n              setSearchHistoryOpen(false);\n              return;\n            }\n            if (searchQuery) {\n              event.preventDefault();\n              onSearchQueryChange('');\n              return;\n            }\n            if (filtersOpen) {\n              event.preventDefault();\n              onToggleFilters();\n              return;\n            }\n            if (filtersActive) {\n              event.preventDefault();\n              onClearSearch();\n              return;\n            }\n            event.currentTarget.blur();\n          }}",
)
replace_exact(
    "src/components/AppHeader.tsx",
    "        >\n          <SlidersHorizontal />\n        </button>\n        {currentCanBeSaved ? (",
    "        >\n          <SlidersHorizontal />\n          {activeFilterCount > 0 ? (\n            <span className=\"search-filter-count\" aria-hidden=\"true\">\n              {activeFilterCount}\n            </span>\n          ) : null}\n        </button>\n        {currentCanBeSaved ? (",
)
replace_exact(
    "src/components/AppHeader.tsx",
    "        {searchHistoryOpen && !searchQuery.trim() && !filtersActive && !filtersOpen ? (",
    "        {historyVisible ? (",
)

# --- Filter panel: explicit header/close control for desktop and mobile sheet. ---
replace_exact(
    "src/features/search/SearchFiltersPanel.tsx",
    "import { RotateCcw } from 'lucide-react';",
    "import { RotateCcw, X } from 'lucide-react';",
)
replace_exact(
    "src/features/search/SearchFiltersPanel.tsx",
    "  onChange(filters: SearchFilters): void;\n}\n\nexport function SearchFiltersPanel({ filters, labels, onChange }: SearchFiltersPanelProps) {",
    "  onChange(filters: SearchFilters): void;\n  onClose(): void;\n}\n\nexport function SearchFiltersPanel({ filters, labels, onChange, onClose }: SearchFiltersPanelProps) {",
)
replace_exact(
    "src/features/search/SearchFiltersPanel.tsx",
    "  return (\n    <section className=\"search-filters\" aria-label=\"Search filters\">\n      <div className=\"search-filter-row search-filter-selects\">",
    "  return (\n    <section className=\"search-filters\" aria-label=\"Search filters\">\n      <header className=\"search-filters-header\">\n        <div>\n          <strong>Filters</strong>\n          <span>Refine local results</span>\n        </div>\n        <button\n          className=\"search-filters-close\"\n          type=\"button\"\n          aria-label=\"Close search filters\"\n          onClick={onClose}\n        >\n          <X aria-hidden=\"true\" />\n        </button>\n      </header>\n\n      <div className=\"search-filter-row search-filter-selects\">",
)

# --- App shell: compact search workspace on mobile and provide close/reset callbacks. ---
replace_exact(
    "src/app/AppShell.tsx",
    "          <div className=\"workspace\">",
    "          <div className={`workspace${searchActive ? ' workspace-search-active' : ''}`}>",
)
replace_exact(
    "src/app/AppShell.tsx",
    "                labels={labels}\n                onFiltersChange={setSearchFilters}\n              />",
    "                labels={labels}\n                onFiltersChange={setSearchFilters}\n                onCloseFilters={() => setSearchFiltersOpen(false)}\n                onClearSearch={clearSearch}\n              />",
)

# --- Search workspace: match context, chips, mobile backdrop, focus restoration, empty recovery. ---
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "import { useCallback, useEffect, useMemo, useState } from 'react';\nimport { LayoutGrid, Rows3, SearchX } from 'lucide-react';",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport { LayoutGrid, Rows3, SearchX, X } from 'lucide-react';",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "import { NoteEditorDialog } from '../notes/NoteEditorDialog';\nimport { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';\nimport { parseSearchQuery, searchDocuments, type SearchDocument } from './searchEngine';",
    "import { NoteEditorDialog } from '../notes/NoteEditorDialog';\nimport { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';\nimport { richTextToPlainText } from '../richText/richText';\nimport {\n  parseSearchQuery,\n  primarySearchMatchField,\n  searchDocuments,\n  type SearchDocument,\n} from './searchEngine';",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "import type { SearchFilters } from './searchTypes';",
    "import { DEFAULT_SEARCH_FILTERS, hasSearchFilters, type SearchFilters } from './searchTypes';",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  labels: LabelRecord[];\n  onFiltersChange(filters: SearchFilters): void;\n}",
    "  labels: LabelRecord[];\n  onFiltersChange(filters: SearchFilters): void;\n  onCloseFilters(): void;\n  onClearSearch(): void;\n}",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  filtersOpen,\n  labels,\n  onFiltersChange,\n}: SearchWorkspaceProps) {",
    "  filtersOpen,\n  labels,\n  onFiltersChange,\n  onCloseFilters,\n  onClearSearch,\n}: SearchWorkspaceProps) {",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  const [attachmentRefreshByNote, setAttachmentRefreshByNote] = useState<Record<string, number>>(\n    {},\n  );",
    "  const [attachmentRefreshByNote, setAttachmentRefreshByNote] = useState<Record<string, number>>(\n    {},\n  );\n  const searchOriginNoteIdRef = useRef<string | null>(null);",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  const documentsById = useMemo(\n    () => new Map(documents.map((document) => [document.note.id, document])),\n    [documents],\n  );",
    "  const documentsById = useMemo(\n    () => new Map(documents.map((document) => [document.note.id, document])),\n    [documents],\n  );\n  const activeFilterChips = useMemo(\n    () => buildActiveFilterChips(filters, labels),\n    [filters, labels],\n  );\n  const searchContextByNote = useMemo<Record<string, string>>(() => {\n    const contexts: Record<string, string> = {};\n    for (const result of results) {\n      const context = buildSearchContext(result.document, query);\n      if (context) contexts[result.document.note.id] = context;\n    }\n    return contexts;\n  }, [query, results]);",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "      open: (note) => {\n        const document = documentsById.get(note.id);\n        if (document) setEditing({ note: document.note, items: document.checklistItems });\n      },",
    "      open: (note) => {\n        const document = documentsById.get(note.id);\n        if (!document) return;\n        searchOriginNoteIdRef.current = note.id;\n        setEditing({ note: document.note, items: document.checklistItems });\n      },",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  const handleUndo = useCallback(() => {\n    const undo = toast?.undo;",
    "  const closeEditing = useCallback(() => {\n    setEditing(null);\n    window.requestAnimationFrame(() => {\n      if (document.querySelector('[role=\"dialog\"]')) return;\n      const noteId = searchOriginNoteIdRef.current;\n      const card = noteId\n        ? document.querySelector<HTMLElement>(`[data-note-id=\"${noteId}\"]`)\n        : null;\n      const target = card?.querySelector<HTMLButtonElement>('.note-card-open');\n      if (target) {\n        target.focus();\n        return;\n      }\n      document.querySelector<HTMLInputElement>('input[aria-label=\"Search notes\"]')?.focus();\n    });\n  }, []);\n\n  const handleUndo = useCallback(() => {\n    const undo = toast?.undo;",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "      {filtersOpen ? (\n        <SearchFiltersPanel filters={filters} labels={labels} onChange={onFiltersChange} />\n      ) : null}\n\n      <div className=\"search-results-toolbar\">\n        <div>\n          <strong>{loaded ? results.length : '…'}</strong>{' '}\n          <span>{results.length === 1 ? 'result' : 'results'}</span>\n        </div>",
    "      {filtersOpen ? (\n        <>\n          <button\n            className=\"search-filters-backdrop\"\n            type=\"button\"\n            aria-label=\"Close search filters\"\n            onClick={onCloseFilters}\n          />\n          <SearchFiltersPanel\n            filters={filters}\n            labels={labels}\n            onChange={onFiltersChange}\n            onClose={onCloseFilters}\n          />\n        </>\n      ) : null}\n\n      <div className=\"search-results-toolbar\">\n        <div className=\"search-results-summary\" role=\"status\" aria-live=\"polite\">\n          <strong>{loaded ? results.length : '…'}</strong>{' '}\n          <span>{results.length === 1 ? 'result' : 'results'}</span>\n          {query.trim() ? <span className=\"search-results-for\"> for “{query.trim()}”</span> : null}\n        </div>",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "      </div>\n\n      {parsedQuery.errors.length > 0 ? (",
    "      </div>\n\n      {activeFilterChips.length > 0 ? (\n        <div className=\"search-active-filters\" aria-label=\"Active search filters\">\n          {activeFilterChips.map((chip) => (\n            <button\n              className=\"search-filter-chip\"\n              type=\"button\"\n              aria-label={`Remove filter ${chip.label}`}\n              key={chip.key}\n              onClick={() => onFiltersChange(chip.nextFilters)}\n            >\n              <span>{chip.label}</span>\n              <X aria-hidden=\"true\" />\n            </button>\n          ))}\n          <button\n            className=\"search-clear-active-filters\"\n            type=\"button\"\n            onClick={() => onFiltersChange({ ...DEFAULT_SEARCH_FILTERS })}\n          >\n            Clear filters\n          </button>\n        </div>\n      ) : null}\n\n      {parsedQuery.errors.length > 0 ? (",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "          <h2 id=\"search-empty-title\">No matching notes</h2>\n          <p>Try fewer words, remove a filter, or use a broader date range.</p>\n        </section>",
    "          <h2 id=\"search-empty-title\">No matching notes</h2>\n          <p>Try fewer words, remove a filter, or use a broader date range.</p>\n          <div className=\"search-empty-actions\">\n            <button className=\"search-empty-reset\" type=\"button\" onClick={onClearSearch}>\n              Reset search\n            </button>\n          </div>\n        </section>",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "          attachmentRefreshByNote={attachmentRefreshByNote}\n        />",
    "          attachmentRefreshByNote={attachmentRefreshByNote}\n          searchContextByNote={searchContextByNote}\n        />",
    expected=2,
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "            onClose={() => setEditing(null)}",
    "            onClose={closeEditing}",
    expected=2,
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "  attachmentRefreshByNote,\n}: {\n  title: string | null;\n  documents: SearchDocument[];\n  mode: NoteCollectionMode;\n  viewMode: NotesViewMode;\n  labels: LabelRecord[];\n  actions: NoteCardActions;\n  attachmentRefreshByNote: Record<string, number>;\n}) {",
    "  attachmentRefreshByNote,\n  searchContextByNote,\n}: {\n  title: string | null;\n  documents: SearchDocument[];\n  mode: NoteCollectionMode;\n  viewMode: NotesViewMode;\n  labels: LabelRecord[];\n  actions: NoteCardActions;\n  attachmentRefreshByNote: Record<string, number>;\n  searchContextByNote: Record<string, string>;\n}) {",
)
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "        checklistItemsByNote={checklistItemsByNote}\n        attachmentRefreshByNote={attachmentRefreshByNote}\n      />",
    "        checklistItemsByNote={checklistItemsByNote}\n        attachmentRefreshByNote={attachmentRefreshByNote}\n        searchContextByNote={searchContextByNote}\n      />",
)

# Add pure helpers after SearchWorkspace so filters/context remain presentation-only.
with Path("src/features/search/SearchWorkspace.tsx").open("a") as file:
    file.write(
        r'''

interface ActiveFilterChip {
  key: string;
  label: string;
  nextFilters: SearchFilters;
}

function buildActiveFilterChips(filters: SearchFilters, labels: LabelRecord[]): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.type !== 'any') {
    chips.push({
      key: 'type',
      label: `Type: ${filters.type === 'text' ? 'Text' : 'Checklist'}`,
      nextFilters: { ...filters, type: 'any' },
    });
  }
  if (filters.status !== 'any') {
    chips.push({
      key: 'status',
      label: `Status: ${capitalize(filters.status)}`,
      nextFilters: { ...filters, status: 'any' },
    });
  }
  for (const color of filters.colors) {
    chips.push({
      key: `color:${color}`,
      label: `Color: ${capitalize(color)}`,
      nextFilters: { ...filters, colors: filters.colors.filter((item) => item !== color) },
    });
  }
  for (const labelId of filters.labelIds) {
    const name = labels.find((label) => label.id === labelId)?.name ?? 'Unknown';
    chips.push({
      key: `label:${labelId}`,
      label: `Label: ${name}`,
      nextFilters: { ...filters, labelIds: filters.labelIds.filter((id) => id !== labelId) },
    });
  }
  if (filters.after) {
    chips.push({
      key: 'after',
      label: `After: ${filters.after}`,
      nextFilters: { ...filters, after: '' },
    });
  }
  if (filters.before) {
    chips.push({
      key: 'before',
      label: `Before: ${filters.before}`,
      nextFilters: { ...filters, before: '' },
    });
  }
  return chips;
}

function buildSearchContext(document: SearchDocument, query: string): string | null {
  const field = primarySearchMatchField(document, query);
  if (!field) return null;

  if (field === 'title') return formatSearchContext('Title', document.note.title);
  if (field === 'label') return formatSearchContext('Label', document.labelNames.join(' · '));
  if (field === 'attachment') {
    return formatSearchContext('Attachment', document.attachmentNames.join(' · '));
  }
  if (field === 'ocr') return formatSearchContext('OCR', document.ocrText);
  if (field === 'checklist') {
    return formatSearchContext(
      'Checklist',
      document.checklistItems.map((item) => item.text).filter(Boolean).join(' · '),
    );
  }
  const body =
    document.note.type === 'text'
      ? richTextToPlainText(document.note.content)
      : document.note.content;
  return formatSearchContext('Text', body);
}

function formatSearchContext(label: string, value: string): string | null {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (!compact) return null;
  const maximum = 150;
  const excerpt =
    compact.length > maximum ? `${compact.slice(0, maximum - 1).trimEnd()}…` : compact;
  return `${label} · ${excerpt}`;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toLocaleUpperCase() ?? ''}${value.slice(1)}` : value;
}
'''
    )

# Remove an unused import introduced by active filter helper availability check if not used elsewhere.
replace_exact(
    "src/features/search/SearchWorkspace.tsx",
    "import { DEFAULT_SEARCH_FILTERS, hasSearchFilters, type SearchFilters } from './searchTypes';",
    "import { DEFAULT_SEARCH_FILTERS, type SearchFilters } from './searchTypes';",
)

# --- Masonry/NoteCard: carry and display per-result match context. ---
replace_exact(
    "src/features/notes/MasonryGrid.tsx",
    "  attachmentRefreshByNote?: Record<string, number>;\n  selectedNoteIds?: Set<string>;",
    "  attachmentRefreshByNote?: Record<string, number>;\n  searchContextByNote?: Record<string, string>;\n  selectedNoteIds?: Set<string>;",
)
replace_exact(
    "src/features/notes/MasonryGrid.tsx",
    "  attachmentRefreshByNote = {},\n  selectedNoteIds,",
    "  attachmentRefreshByNote = {},\n  searchContextByNote = {},\n  selectedNoteIds,",
)
replace_exact(
    "src/features/notes/MasonryGrid.tsx",
    "              attachmentRefreshKey={attachmentRefreshByNote[note.id] ?? 0}\n              selection={",
    "              attachmentRefreshKey={attachmentRefreshByNote[note.id] ?? 0}\n              searchContext={searchContextByNote[note.id]}\n              selection={",
)
replace_exact(
    "src/features/notes/NoteCard.tsx",
    "  attachmentRefreshKey?: number;\n  selection?: NoteCardSelection | undefined;",
    "  attachmentRefreshKey?: number;\n  searchContext?: string | undefined;\n  selection?: NoteCardSelection | undefined;",
)
replace_exact(
    "src/features/notes/NoteCard.tsx",
    "  attachmentRefreshKey = 0,\n  selection,",
    "  attachmentRefreshKey = 0,\n  searchContext,\n  selection,",
)
replace_exact(
    "src/features/notes/NoteCard.tsx",
    "            attachmentRefreshKey={attachmentRefreshKey}\n          />",
    "            attachmentRefreshKey={attachmentRefreshKey}\n            searchContext={searchContext}\n          />",
    expected=2,
)
replace_exact(
    "src/features/notes/NoteCard.tsx",
    "  attachmentRefreshKey,\n}: {\n  note: NoteRecord;\n  mode: NoteCardMode;\n  reminder: ReminderRecord | null;\n  labels: LabelRecord[];\n  checklistItems: ChecklistItemRecord[];\n  attachmentRefreshKey: number;\n}) {",
    "  attachmentRefreshKey,\n  searchContext,\n}: {\n  note: NoteRecord;\n  mode: NoteCardMode;\n  reminder: ReminderRecord | null;\n  labels: LabelRecord[];\n  checklistItems: ChecklistItemRecord[];\n  attachmentRefreshKey: number;\n  searchContext?: string | undefined;\n}) {",
)
replace_exact(
    "src/features/notes/NoteCard.tsx",
    "      {note.type === 'text' && !note.title && !note.content ? (\n        <span className=\"note-card-empty\">Empty note</span>\n      ) : null}\n      {reminder && (reminder.status === 'active' || mode === 'reminders') ? (",
    "      {note.type === 'text' && !note.title && !note.content ? (\n        <span className=\"note-card-empty\">Empty note</span>\n      ) : null}\n      {searchContext ? (\n        <span className=\"note-card-search-context\" aria-label={`Search match: ${searchContext}`}>\n          {searchContext}\n        </span>\n      ) : null}\n      {reminder && (reminder.status === 'active' || mode === 'reminders') ? (",
)

# --- Dedicated polish layer loaded last. ---
replace_exact(
    "src/styles.css",
    "@import './styles/capture-mobile-polish.css';\n",
    "@import './styles/capture-mobile-polish.css';\n@import './styles/retrieval-search-polish.css';\n",
)
Path("src/styles/retrieval-search-polish.css").write_text(
    r'''/* V3.2 — Retrieval & Search Polish */

.search-inline-action {
  position: relative;
}

.search-filter-count {
  position: absolute;
  top: -2px;
  right: -2px;
  display: grid;
  min-width: 16px;
  height: 16px;
  place-items: center;
  padding-inline: 4px;
  border: 2px solid var(--surface-subtle);
  border-radius: var(--radius-pill);
  background: var(--accent-strong);
  color: var(--surface);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
}

.search-filters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.search-filters-header > div {
  display: grid;
  gap: 2px;
}

.search-filters-header strong {
  color: var(--text);
  font-size: var(--text-sm);
}

.search-filters-header span {
  color: var(--text-subtle);
  font-size: var(--text-xs);
}

.search-filters-close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.search-filters-close:hover,
.search-filters-close:focus-visible {
  background: var(--surface-hover);
  color: var(--text);
  outline: 0;
}

.search-filters-close svg {
  width: 18px;
  height: 18px;
}

.search-filters-backdrop {
  display: none;
}

.search-results-summary {
  min-width: 0;
}

.search-results-for {
  color: var(--text-subtle);
}

.search-active-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
}

.search-filter-chip,
.search-clear-active-filters,
.search-empty-reset {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
}

.search-filter-chip {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-subtle);
  font-size: var(--text-xs);
}

.search-filter-chip:hover,
.search-filter-chip:focus-visible {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  color: var(--text);
  outline: 0;
}

.search-filter-chip svg {
  width: 13px;
  height: 13px;
}

.search-clear-active-filters {
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  color: var(--accent-strong);
  font-size: var(--text-xs);
  font-weight: 700;
}

.search-clear-active-filters:hover,
.search-clear-active-filters:focus-visible,
.search-empty-reset:hover,
.search-empty-reset:focus-visible {
  background: var(--surface-hover);
  outline: 0;
}

.note-card-search-context {
  display: block;
  margin-top: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.search-empty-actions {
  margin-top: var(--space-4);
}

.search-empty-reset {
  min-height: 38px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--accent-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 600px) {
  .workspace-search-active {
    padding-top: var(--space-3);
  }

  .workspace-search-active > .workspace-heading {
    display: none;
  }

  .search-history-popover {
    position: fixed;
    top: calc(var(--header-height) + 6px);
    right: 8px;
    left: 8px;
    max-height: calc(100dvh - var(--header-height) - 18px);
    border-radius: var(--radius-lg);
  }

  .search-filters-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-dialog) - 1);
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: var(--scrim);
  }

  .search-filters {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: var(--z-dialog);
    max-height: min(78dvh, 680px);
    margin: 0;
    padding: var(--space-4) var(--space-4)
      calc(var(--space-4) + env(safe-area-inset-bottom));
    overflow: auto;
    overscroll-behavior: contain;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -18px 52px rgb(15 18 24 / 24%);
  }

  .search-filters-header {
    position: sticky;
    top: calc(var(--space-4) * -1);
    z-index: 2;
    margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) 0;
    padding: var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .search-filters-close {
    width: 44px;
    height: 44px;
  }

  .search-results-toolbar {
    min-height: 34px;
    margin-bottom: var(--space-3);
  }

  .search-results-toolbar .notes-view-toggle {
    display: none;
  }

  .search-results-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-active-filters {
    flex-wrap: nowrap;
    margin-inline: calc(var(--space-3) * -1);
    padding-inline: var(--space-3);
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .search-active-filters::-webkit-scrollbar {
    display: none;
  }

  .search-filter-chip {
    flex: 0 0 auto;
    min-height: 38px;
  }

  .search-clear-active-filters {
    flex: 0 0 auto;
    min-height: 38px;
  }
}
'''
)

# --- Retrieval polish regression tests. ---
Path("e2e/search-retrieval-polish.spec.ts").write_text(
    r'''import { expect, test, type Page } from '@playwright/test';

async function seedRetrievalLibrary(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);

    const fuzzy = await notes.create({
      title: 'Missionary preparation',
      content: 'Language and field preparation.',
    });
    const attachment = await notes.create({
      title: 'Budget archive',
      content: 'Reference files.',
    });
    await dbModule.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: attachment.id,
      name: 'roadmap-budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1,
      checksum: 'v3-2-attachment',
      data: new Blob(['x']),
      createdAt: Date.now(),
    });
    const ocr = await notes.create({
      title: 'Travel scan',
      content: 'Photo\n\n## Extracted text\n\nFlight reservation AB123\nGate 7',
    });
    const checklist = await checklists.create('Packing list', [
      { id: crypto.randomUUID(), text: 'Passport', checked: false, parentId: null },
    ]);
    const work = await labels.create('Work');
    await labels.assign(checklist.note.id, work.id);

    return {
      fuzzyId: fuzzy.id,
      attachmentId: attachment.id,
      ocrId: ocr.id,
      checklistId: checklist.note.id,
    };
  });
}

async function fillSearch(page: Page, query: string) {
  const input = page.getByRole('searchbox', { name: 'Search notes' });
  await input.fill(query);
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  return input;
}

test('search results explain attachment, OCR, and fuzzy title matches', async ({ page }) => {
  const ids = await seedRetrievalLibrary(page);

  await fillSearch(page, 'roadmap budget');
  await expect(page.locator(`[data-note-id="${ids.attachmentId}"] .note-card-search-context`)).toContainText(
    'Attachment · roadmap-budget.xlsx',
  );

  await fillSearch(page, 'reservation ab123');
  await expect(page.locator(`[data-note-id="${ids.ocrId}"] .note-card-search-context`)).toContainText(
    'OCR · Flight reservation AB123',
  );

  await fillSearch(page, 'misionary');
  await expect(page.locator(`[data-note-id="${ids.fuzzyId}"] .note-card-search-context`)).toContainText(
    'Title · Missionary preparation',
  );
});

test('ArrowDown enters results and closing a result restores retrieval focus', async ({ page }) => {
  const ids = await seedRetrievalLibrary(page);
  const input = await fillSearch(page, 'missionary');
  const result = page.locator(`[data-note-id="${ids.fuzzyId}"]`).getByRole('button', {
    name: 'Open note: Missionary preparation',
  });

  await input.press('ArrowDown');
  await expect(result).toBeFocused();
  await result.press('Enter');

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(result).toBeFocused();
});

test('active filter chips are individually removable and Escape unwinds search in stages', async ({
  page,
}) => {
  const ids = await seedRetrievalLibrary(page);
  await page.reload();

  const input = page.getByRole('searchbox', { name: 'Search notes' });
  await page.getByRole('button', { name: 'Search filters' }).click();
  const filters = page.getByRole('region', { name: 'Search filters' });
  await filters.getByLabel('Type').selectOption('checklist');
  await filters.getByLabel('Work').check();
  await expect(page.locator(`[data-note-id="${ids.checklistId}"]`)).toBeVisible();

  await expect(page.getByRole('button', { name: 'Remove filter Type: Checklist' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter Label: Work' })).toBeVisible();
  await expect(page.locator('.search-filter-count')).toHaveText('2');

  await page.getByRole('button', { name: 'Close search filters' }).first().click();
  await page.getByRole('button', { name: 'Remove filter Type: Checklist' }).click();
  await expect(page.getByRole('button', { name: 'Remove filter Type: Checklist' })).toHaveCount(0);
  await expect(page.locator('.search-filter-count')).toHaveText('1');

  await input.fill('passport');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove filter Label: Work' })).toBeVisible();

  await input.press('Escape');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.locator('.search-filter-count')).toHaveCount(0);
});

test('mobile filters open as a bottom sheet and can be dismissed explicitly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Search filters' }).click();

  const filters = page.getByRole('region', { name: 'Search filters' });
  await expect(filters).toBeVisible();
  expect(await filters.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeHidden();

  await filters.getByRole('button', { name: 'Close search filters' }).click();
  await expect(filters).toHaveCount(0);
});
'''
)
