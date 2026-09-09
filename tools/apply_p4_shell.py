from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, expected))


replace(
    'src/app/AppShell.tsx',
    "import type { CaptureRequest } from '../features/notes/NotesWorkspace';\n",
    "import type { CaptureKind, CaptureRequest } from '../features/notes/captureTypes';\n",
)

replace(
    'src/app/AppShell.tsx',
    '''const LabelManagerDialog = lazy(() =>
  import('../features/notes/LabelManagerDialog').then((module) => ({
    default: module.LabelManagerDialog,
  })),
);

''',
    '''const LabelManagerDialog = lazy(() =>
  import('../features/notes/LabelManagerDialog').then((module) => ({
    default: module.LabelManagerDialog,
  })),
);
const CaptureMenu = lazy(() =>
  import('../features/notes/CaptureMenu').then((module) => ({ default: module.CaptureMenu })),
);

''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
''',
    '''  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
''',
)

replace(
    'src/app/AppShell.tsx',
    '''  const prepareNotesCapture = useCallback(
    (kind: 'text' | 'checklist') => {
      const captureLabelId =
        !searchActive && activeSection === 'notes' && activeLabelId ? activeLabelId : null;
      clearSearch();
      setCommandPaletteOpen(false);
      setActiveSection('notes');
      setActiveLabelId(captureLabelId);
      persistActiveSection('notes');
      persistActiveLabelId(captureLabelId);
      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
      captureRequestIdRef.current += 1;
      setCaptureRequest({ id: captureRequestIdRef.current, kind });
    },
    [activeLabelId, activeSection, clearSearch, searchActive],
  );
''',
    '''  const prepareNotesCapture = useCallback(
    (kind: CaptureKind, files?: File[]) => {
      const captureLabelId =
        !searchActive && activeSection === 'notes' && activeLabelId ? activeLabelId : null;
      clearSearch();
      setCaptureMenuOpen(false);
      setCommandPaletteOpen(false);
      setActiveSection('notes');
      setActiveLabelId(captureLabelId);
      persistActiveSection('notes');
      persistActiveLabelId(captureLabelId);
      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
      captureRequestIdRef.current += 1;
      setCaptureRequest({
        id: captureRequestIdRef.current,
        kind,
        ...(files && files.length > 0 ? { files } : {}),
      });
    },
    [activeLabelId, activeSection, clearSearch, searchActive],
  );

  const openCaptureMenu = useCallback(() => {
    setCommandPaletteOpen(false);
    setMobileSidebarOpen(false);
    setTabletSidebarExpanded(false);
    setCaptureMenuOpen(true);
  }, []);
''',
)

replace(
    'src/app/AppShell.tsx',
    '''      if (!event.shiftKey) {
        const key = event.key.toLocaleLowerCase();
        if (key === 'c') {
          event.preventDefault();
          prepareNotesCapture('text');
          return;
        }
''',
    '''      const key = event.key.toLocaleLowerCase();
      if (event.shiftKey && key === 'c') {
        event.preventDefault();
        prepareNotesCapture('checklist');
        return;
      }

      if (!event.shiftKey) {
        if (key === 'c') {
          event.preventDefault();
          prepareNotesCapture('text');
          return;
        }
''',
)

replace(
    'src/app/AppShell.tsx',
    '''      label: 'New checklist',
      description: 'Create a checklist note',
      group: 'Create',
      keywords: ['list', 'tasks'],
''',
    '''      label: 'New checklist',
      description: 'Create a checklist note',
      group: 'Create',
      shortcut: 'Shift+C',
      keywords: ['list', 'tasks'],
''',
)

replace(
    'src/app/AppShell.tsx',
    '''    {
      id: 'search-notes',
''',
    '''    {
      id: 'new-capture-menu',
      label: 'New…',
      description: 'Choose text, checklist, image, scan, drawing, or voice',
      group: 'Create',
      keywords: ['capture', 'image', 'scan', 'drawing', 'voice'],
      run: openCaptureMenu,
    },
    {
      id: 'search-notes',
''',
)

replace(
    'src/app/AppShell.tsx',
    '''          className="mobile-create"
          aria-label="New note"
          onClick={() => prepareNotesCapture('text')}
''',
    '''          className="mobile-create"
          aria-label="New note"
          aria-expanded={captureMenuOpen}
          onClick={openCaptureMenu}
''',
)

replace(
    'src/app/AppShell.tsx',
    '''      {settingsOpen ? (
''',
    '''      {captureMenuOpen ? (
        <Suspense fallback={null}>
          <CaptureMenu
            onClose={() => setCaptureMenuOpen(false)}
            onCapture={(kind, files) => prepareNotesCapture(kind, files)}
          />
        </Suspense>
      ) : null}

      {settingsOpen ? (
''',
)

print('P4 shell patch applied.')
