import { useState } from 'react';
import { Copy, Download, Maximize2, Minimize2 } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import type { NoteRecord } from '../../db';
import {
  documentFilename,
  documentMarkdown,
  downloadDocument,
  type ExportChecklistItem,
} from './noteUtilities';

export function NoteDocumentTools({
  note,
  items = [],
  focused,
  onFocusChange,
}: {
  note: Pick<NoteRecord, 'type' | 'title' | 'content'>;
  items?: ExportChecklistItem[];
  focused: boolean;
  onFocusChange(focused: boolean): void;
}) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable. Use Download Markdown instead.');
      await navigator.clipboard.writeText(documentMarkdown(note, items));
      setMessage('Markdown copied.');
    } catch {
      setMessage('Clipboard access was blocked. Use Download Markdown instead.');
    }
  };
  return (
    <div className="note-document-tools" role="group" aria-label="Document tools">
      <span className="note-document-kind">
        {note.type === 'checklist' ? 'Checklist' : 'Text note'}
      </span>
      <IconButton label="Copy Markdown" tooltip="Copy Markdown" onClick={() => void copy()}>
        <Copy />
      </IconButton>
      <IconButton
        label="Download Markdown"
        tooltip="Download Markdown"
        onClick={() => {
          downloadDocument(documentFilename(note.title), documentMarkdown(note, items));
          setMessage('Markdown download started. Attachments are available in a full backup.');
        }}
      >
        <Download />
      </IconButton>
      <IconButton
        label={focused ? 'Exit focus mode' : 'Focus mode'}
        tooltip={focused ? 'Exit focus mode' : 'Focus mode'}
        aria-pressed={focused}
        onClick={() => onFocusChange(!focused)}
      >
        {focused ? <Minimize2 /> : <Maximize2 />}
      </IconButton>
      {message ? (
        <span className="note-document-message" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
