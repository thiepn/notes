from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, expected))


# NotesWorkspace uses the shared capture request and selected-note export.
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''import { NOTE_SORT_KEY, readNoteSort, sortDocuments, type NoteSort } from './noteSort';
''',
    '''import { NOTE_SORT_KEY, readNoteSort, sortDocuments, type NoteSort } from './noteSort';
import type { CaptureRequest } from './captureTypes';
import { downloadMarkdownArchive } from './bulkExport';
''',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''export interface CaptureRequest {
  id: number;
  kind: 'text' | 'checklist';
}

''',
    '',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''  const [textCaptureRequestId, setTextCaptureRequestId] = useState<number | undefined>(undefined);
''',
    '''  const [textCaptureRequest, setTextCaptureRequest] = useState<CaptureRequest | null>(null);
''',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''      if (request.kind === 'checklist') {
        setTextCaptureRequestId(undefined);
        setChecklistCaptureOpen(true);
      } else {
        setChecklistCaptureOpen(false);
        setTextCaptureRequestId(request.id);
      }
''',
    '''      if (request.kind === 'checklist') {
        setTextCaptureRequest(null);
        setChecklistCaptureOpen(true);
      } else {
        setChecklistCaptureOpen(false);
        setTextCaptureRequest(request);
      }
''',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''  const handleConfirmBulkDelete = useCallback(async () => {
''',
    '''  const handleBulkExport = useCallback(async () => {
    if (selectedNotes.length === 0) return;
    try {
      await downloadMarkdownArchive(selectedNotes, checklistItemsByNote);
      showToast(
        `Exported ${selectedNotes.length} ${selectedNotes.length === 1 ? 'note' : 'notes'} as Markdown.`,
      );
    } catch {
      showToast('Selected notes could not be exported.');
    }
  }, [checklistItemsByNote, selectedNotes, showToast]);

  const handleConfirmBulkDelete = useCallback(async () => {
''',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''          <TextNoteComposer
            openRequestId={textCaptureRequestId}
''',
    '''          <TextNoteComposer
            captureRequest={textCaptureRequest}
''',
)
replace(
    'src/features/notes/NotesWorkspace.tsx',
    '''                onSetPinned={(pinned) => void handleBulkSetPinned(pinned)}
                onArchive={() => void handleBulkArchive()}
''',
    '''                onSetPinned={(pinned) => void handleBulkSetPinned(pinned)}
                onExport={() => void handleBulkExport()}
                onArchive={() => void handleBulkArchive()}
''',
)

# TextNoteComposer receives capture intents and opens the existing tools directly.
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''import { useTextNoteCapture } from './useTextNoteCapture';
''',
    '''import type { CaptureRequest } from './captureTypes';
import { useTextNoteCapture } from './useTextNoteCapture';
''',
)
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''interface TextNoteComposerProps {
  openRequestId?: number | undefined;
''',
    '''interface TextNoteComposerProps {
  captureRequest?: CaptureRequest | null;
''',
)
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''export function TextNoteComposer({
  openRequestId,
''',
    '''export function TextNoteComposer({
  captureRequest,
''',
)
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''  const lastOpenRequestIdRef = useRef<number | undefined>(undefined);
''',
    '''  const lastCaptureRequestIdRef = useRef<number | undefined>(undefined);
''',
)
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''  useEffect(() => {
    if (openRequestId === undefined || lastOpenRequestIdRef.current === openRequestId) return;
    lastOpenRequestIdRef.current = openRequestId;
    openCapture();
  }, [openCapture, openRequestId]);

''',
    '',
)
replace(
    'src/features/notes/TextNoteComposer.tsx',
    '''  const handleQuickVoice = async (file: File) => {
    setQuickAttachmentMessage(null);
    setQuickAttachmentError(null);
    const note = await ensureNote();
    if (!note) throw new Error('The note could not be created for this voice recording.');
    const result = await voiceAttachmentsRepository.addRecording(note.id, file);
    markAttachmentsChanged(note.id);
    setQuickAttachmentMessage(
      result.skippedDuplicate
        ? 'That voice recording is already attached.'
        : 'Voice recording added.',
    );
  };

''',
    '''  const handleQuickVoice = async (file: File) => {
    setQuickAttachmentMessage(null);
    setQuickAttachmentError(null);
    const note = await ensureNote();
    if (!note) throw new Error('The note could not be created for this voice recording.');
    const result = await voiceAttachmentsRepository.addRecording(note.id, file);
    markAttachmentsChanged(note.id);
    setQuickAttachmentMessage(
      result.skippedDuplicate
        ? 'That voice recording is already attached.'
        : 'Voice recording added.',
    );
  };

  useEffect(() => {
    const request = captureRequest;
    if (!request || lastCaptureRequestIdRef.current === request.id) return;
    lastCaptureRequestIdRef.current = request.id;
    openCapture();

    if (request.kind === 'drawing') {
      setQuickDrawingOpen(true);
      return;
    }
    if (request.kind === 'voice') {
      setQuickVoiceOpen(true);
      return;
    }
    if (request.kind === 'image' || request.kind === 'scan') {
      const files = request.files ?? [];
      if (request.kind === 'scan') setExpandedToolsOpen(true);
      if (files.length > 0) void handleQuickImages(files);
    }
  }, [captureRequest, handleQuickImages, openCapture]);

''',
)

# Bulk toolbar exposes Markdown export in every lifecycle view.
replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    '''  CheckCheck,
  Palette,
''',
    '''  CheckCheck,
  Download,
  Palette,
''',
)
replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    '''  onSetPinned(pinned: boolean): void;
  onArchive(): void;
''',
    '''  onSetPinned(pinned: boolean): void;
  onExport(): void;
  onArchive(): void;
''',
)
replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    '''  onSetPinned,
  onArchive,
''',
    '''  onSetPinned,
  onExport,
  onArchive,
''',
)
replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    '''        {mode === 'notes' ? (
          <IconButton
''',
    '''        <IconButton
          className="bulk-selection-icon"
          label="Export selected notes as Markdown"
          onClick={onExport}
        >
          <Download />
        </IconButton>

        {mode === 'notes' ? (
          <IconButton
''',
)

print('P4 note capture/export patch applied.')
