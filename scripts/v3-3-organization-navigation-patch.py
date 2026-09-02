from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} marker changed")
    return text.replace(old, new, 1)


# Wire mutation notifications from NotesWorkspace back to AppShell.
path = Path('src/features/notes/NotesWorkspace.tsx')
text = path.read_text()
text = replace_once(
    text,
    "interface NotesWorkspaceProps {\n  mode?: NoteCollectionMode;\n  labels: LabelRecord[];\n  filterLabelId?: string | null;\n}\n",
    "interface NotesWorkspaceProps {\n  mode?: NoteCollectionMode;\n  labels: LabelRecord[];\n  filterLabelId?: string | null;\n  onCollectionChanged?: () => void;\n}\n",
    'NotesWorkspace props',
)
text = replace_once(
    text,
    "export function NotesWorkspace({\n  mode = 'notes',\n  labels,\n  filterLabelId = null,\n}: NotesWorkspaceProps) {\n",
    "export function NotesWorkspace({\n  mode = 'notes',\n  labels,\n  filterLabelId = null,\n  onCollectionChanged,\n}: NotesWorkspaceProps) {\n",
    'NotesWorkspace destructure',
)
text = replace_once(
    text,
    "  const refreshCollection = useCallback(async () => {\n    const loadedCollection = await loadCollection(mode, filterLabelId);\n    setCollection({ mode, filterLabelId, ...loadedCollection, loaded: true });\n  }, [filterLabelId, mode]);\n",
    "  const refreshCollection = useCallback(async () => {\n    const loadedCollection = await loadCollection(mode, filterLabelId);\n    setCollection({ mode, filterLabelId, ...loadedCollection, loaded: true });\n    onCollectionChanged?.();\n  }, [filterLabelId, mode, onCollectionChanged]);\n",
    'refreshCollection',
)
text = replace_once(
    text,
    "      setCollection((current) => {\n        if (current.mode !== mode || current.filterLabelId !== filterLabelId) return current;\n        const currentLabelIds = current.labelIdsByNote[note.id] ?? [];\n",
    "      setCollection((current) => {\n        if (current.mode !== mode || current.filterLabelId !== filterLabelId) return current;\n        const currentLabelIds = current.labelIdsByNote[note.id] ?? [];\n",
    'handleSaved state marker',
)
old = "      });\n    },\n    [filterLabelId, mode],\n  );\n\n  const handleChecklistSaved = useCallback("
new = "      });\n      onCollectionChanged?.();\n    },\n    [filterLabelId, mode, onCollectionChanged],\n  );\n\n  const handleChecklistSaved = useCallback("
text = replace_once(text, old, new, 'handleSaved callback')
old = "      });\n    },\n    [filterLabelId, mode],\n  );\n\n  const handleConvertedToText = useCallback("
new = "      });\n      onCollectionChanged?.();\n    },\n    [filterLabelId, mode, onCollectionChanged],\n  );\n\n  const handleConvertedToText = useCallback("
text = replace_once(text, old, new, 'handleRemoved callback')
path.write_text(text)


# AppShell owns all derived navigation stats and palette destinations.
path = Path('src/app/AppShell.tsx')
text = path.read_text()
text = replace_once(
    text,
    "import { LabelManagerDialog } from '../features/notes/LabelManagerDialog';\n",
    "import { LabelManagerDialog } from '../features/notes/LabelManagerDialog';\nimport {\n  EMPTY_NAVIGATION_STATS,\n  loadNavigationStats,\n  type NavigationStats,\n} from '../features/organization/navigationStats';\n",
    'navigation stats import',
)
text = replace_once(
    text,
    "  const [labels, setLabels] = useState<LabelRecord[]>([]);\n",
    "  const [labels, setLabels] = useState<LabelRecord[]>([]);\n  const [navigationStats, setNavigationStats] = useState<NavigationStats>(EMPTY_NAVIGATION_STATS);\n",
    'navigation stats state',
)
text = replace_once(
    text,
    "  const refreshLabels = useCallback(async () => {\n    setLabels(await labelsRepository.list());\n  }, []);\n\n",
    "  const refreshLabels = useCallback(async () => {\n    setLabels(await labelsRepository.list());\n  }, []);\n\n  const refreshNavigationStats = useCallback(async () => {\n    try {\n      setNavigationStats(await loadNavigationStats());\n    } catch {\n      // Navigation counts are derived convenience state and never block note access.\n    }\n  }, []);\n\n",
    'refresh navigation stats',
)
text = replace_once(
    text,
    "    await refreshLabels();\n  }, [clearSearch, refreshLabels]);\n",
    "    await Promise.all([refreshLabels(), refreshNavigationStats()]);\n  }, [clearSearch, refreshLabels, refreshNavigationStats]);\n",
    'library restore stats',
)
# Initial stats + reminder changes.
marker = "  useEffect(() => {\n    const mediaQuery = window.matchMedia(MOBILE_QUERY);\n"
insert = "  useEffect(() => {\n    void refreshNavigationStats();\n    const handleReminderChanged = () => void refreshNavigationStats();\n    window.addEventListener('notes-reminders-changed', handleReminderChanged);\n    return () => window.removeEventListener('notes-reminders-changed', handleReminderChanged);\n  }, [refreshNavigationStats]);\n\n"
if insert not in text:
    if marker not in text:
        raise SystemExit('navigation stats effect marker changed')
    text = text.replace(marker, insert + marker, 1)
# Label CRUD refreshes derived counts.
text = replace_once(
    text,
    "  const handleCreateLabel = async (name: string) => {\n    await labelsRepository.create(name);\n    await refreshLabels();\n  };\n",
    "  const handleCreateLabel = async (name: string) => {\n    await labelsRepository.create(name);\n    await Promise.all([refreshLabels(), refreshNavigationStats()]);\n  };\n",
    'create label stats',
)
text = replace_once(
    text,
    "  const handleRenameLabel = async (labelId: string, name: string) => {\n    await labelsRepository.rename(labelId, name);\n    await refreshLabels();\n  };\n",
    "  const handleRenameLabel = async (labelId: string, name: string) => {\n    await labelsRepository.rename(labelId, name);\n    await Promise.all([refreshLabels(), refreshNavigationStats()]);\n  };\n",
    'rename label stats',
)
text = replace_once(
    text,
    "    await refreshLabels();\n  };\n\n  const prepareNotesCapture",
    "    await Promise.all([refreshLabels(), refreshNavigationStats()]);\n  };\n\n  const prepareNotesCapture",
    'delete label stats',
)
# Active count and label palette commands.
marker = "  const paletteCommands: CommandPaletteItem[] = [\n"
insert = "  const activeWorkspaceCount = searchActive || activeSection === 'backup'\n    ? null\n    : activeLabel\n      ? (navigationStats.labels[activeLabel.id] ?? 0)\n      : activeSection === 'notes'\n        ? navigationStats.notes\n        : activeSection === 'reminders'\n          ? navigationStats.reminders\n          : activeSection === 'archive'\n            ? navigationStats.archive\n            : navigationStats.trash;\n  const activeWorkspaceCountLabel =\n    activeWorkspaceCount === null\n      ? null\n      : activeSection === 'reminders' && activeLabel === null\n        ? `${activeWorkspaceCount} active ${activeWorkspaceCount === 1 ? 'reminder' : 'reminders'}`\n        : `${activeWorkspaceCount} ${activeWorkspaceCount === 1 ? 'note' : 'notes'}`;\n  const labelPaletteCommands: CommandPaletteItem[] = labels.map((label) => {\n    const count = navigationStats.labels[label.id] ?? 0;\n    return {\n      id: `open-label:${label.id}`,\n      label: `Open label: ${label.name}`,\n      description: `${count} active ${count === 1 ? 'note' : 'notes'}`,\n      group: 'Labels',\n      keywords: ['label', 'tag', label.name],\n      run: () => handleLabelNavigate(label.id),\n    };\n  });\n\n"
if insert not in text:
    if marker not in text:
        raise SystemExit('palette marker changed')
    text = text.replace(marker, insert + marker, 1)
text = replace_once(
    text,
    "    {\n      id: 'grid-view',\n",
    "    ...labelPaletteCommands,\n    {\n      id: 'grid-view',\n",
    'label palette insertion',
)
# Sidebar counts.
text = replace_once(
    text,
    "          labels={labels}\n          compact={sidebarCompact}\n",
    "          labels={labels}\n          counts={navigationStats}\n          compact={sidebarCompact}\n",
    'sidebar counts prop',
)
# Workspace heading count.
text = replace_once(
    text,
    "                <h1>{section.title}</h1>\n                <p>{section.description}</p>\n",
    "                <div className=\"workspace-title-line\">\n                  <h1>{section.title}</h1>\n                  {activeWorkspaceCountLabel ? (\n                    <span className=\"workspace-count\">{activeWorkspaceCountLabel}</span>\n                  ) : null}\n                </div>\n                <p>{section.description}</p>\n",
    'workspace count display',
)
# Workspace mutation hook.
text = replace_once(
    text,
    "                filterLabelId={activeLabel?.id ?? null}\n              />\n",
    "                filterLabelId={activeLabel?.id ?? null}\n                onCollectionChanged={() => void refreshNavigationStats()}\n              />\n",
    'workspace stats callback',
)
path.write_text(text)
