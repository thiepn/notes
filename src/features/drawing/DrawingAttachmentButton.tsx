import { useState } from 'react';
import { PencilLine } from 'lucide-react';

import type { AttachmentsRepository } from '../../db';
import { DrawingDialog } from './DrawingDialog';

interface DrawingAttachmentButtonProps {
  noteId: string | null;
  repository: AttachmentsRepository;
  ensureNoteId?: (() => Promise<string | null>) | undefined;
  disabled?: boolean;
  className?: string;
  onChanged?: ((noteId: string) => void) | undefined;
}

export function DrawingAttachmentButton({
  noteId,
  repository,
  ensureNoteId,
  disabled = false,
  className = '',
  onChanged,
}: DrawingAttachmentButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async (file: File) => {
    if (saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const target = noteId ?? (await ensureNoteId?.()) ?? null;
      if (!target) throw new Error('Save the note before adding a drawing.');
      await repository.addImages(target, [file]);
      onChanged?.(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The drawing could not be attached.';
      setErrorMessage(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <span className="drawing-attachment-action">
        <button
          className={className}
          type="button"
          aria-label="Add drawing"
          disabled={disabled || saving}
          onClick={() => {
            setErrorMessage(null);
            setOpen(true);
          }}
        >
          <PencilLine aria-hidden="true" />
          {saving ? 'Saving…' : 'Draw'}
        </button>
        {errorMessage ? (
          <span className="drawing-attachment-error" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </span>

      {open ? <DrawingDialog onSave={save} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
