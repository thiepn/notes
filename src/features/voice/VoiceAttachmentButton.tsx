import { useState } from 'react';
import { Mic } from 'lucide-react';

import type { VoiceAttachmentsRepository } from '../../db';
import { VoiceRecorderDialog } from './VoiceRecorderDialog';

interface VoiceAttachmentButtonProps {
  noteId: string | null;
  repository: VoiceAttachmentsRepository;
  ensureNoteId?: (() => Promise<string | null>) | undefined;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  onChanged?: ((noteId: string) => void) | undefined;
}

export function VoiceAttachmentButton({
  noteId,
  repository,
  ensureNoteId,
  disabled = false,
  className = '',
  compact = false,
  onChanged,
}: VoiceAttachmentButtonProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async (file: File) => {
    if (saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const target = noteId ?? (await ensureNoteId?.()) ?? null;
      if (!target) throw new Error('Save the note before adding a voice recording.');
      await repository.addRecording(target, file);
      onChanged?.(target);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The voice recording could not be attached.';
      setErrorMessage(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <span className="voice-attachment-action">
        <button
          className={className}
          type="button"
          aria-label="Record voice note"
          title={compact ? 'New voice note' : undefined}
          disabled={disabled || saving}
          onClick={() => {
            setErrorMessage(null);
            setOpen(true);
          }}
        >
          <Mic aria-hidden="true" />
          {compact ? null : saving ? 'Saving…' : 'Record voice'}
        </button>
        {errorMessage ? (
          <span className="voice-attachment-error" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </span>

      {open ? <VoiceRecorderDialog onSave={save} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
