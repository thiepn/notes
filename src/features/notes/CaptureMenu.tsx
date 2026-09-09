import { useRef, type ChangeEvent, type ReactNode, type Ref } from 'react';
import { Camera, ImagePlus, ListChecks, Mic, PencilLine, StickyNote, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import { NATIVE_IMAGE_ACCEPT } from '../../db';
import type { CaptureKind } from './captureTypes';

interface CaptureMenuProps {
  onClose(): void;
  onCapture(kind: CaptureKind, files?: File[]): void;
}

export function CaptureMenu({ onClose, onCapture }: CaptureMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: firstActionRef });

  const chooseFiles = (kind: 'image' | 'scan', event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    onCapture(kind, files);
  };

  return (
    <div
      className="capture-menu-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="capture-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-menu-title"
        tabIndex={-1}
      >
        <header className="capture-menu-header">
          <div>
            <p className="workspace-kicker">Capture</p>
            <h2 id="capture-menu-title">New</h2>
          </div>
          <IconButton label="Close new note menu" onClick={onClose}>
            <X />
          </IconButton>
        </header>

        <div className="capture-menu-grid">
          <CaptureAction
            buttonRef={firstActionRef}
            icon={<StickyNote />}
            label="Text note"
            description="Start with a blank note"
            onClick={() => onCapture('text')}
          />
          <CaptureAction
            icon={<ListChecks />}
            label="Checklist"
            description="Create an actionable list"
            onClick={() => onCapture('checklist')}
          />
          <CaptureAction
            icon={<ImagePlus />}
            label="Image"
            description="Start a note from photos"
            onClick={() => imageInputRef.current?.click()}
          />
          <CaptureAction
            icon={<Camera />}
            label="Scan"
            description="Capture a page for local OCR"
            onClick={() => scanInputRef.current?.click()}
          />
          <CaptureAction
            icon={<PencilLine />}
            label="Drawing"
            description="Sketch directly into a note"
            onClick={() => onCapture('drawing')}
          />
          <CaptureAction
            icon={<Mic />}
            label="Voice"
            description="Attach a voice recording"
            onClick={() => onCapture('voice')}
          />
        </div>

        <input
          ref={imageInputRef}
          className="attachment-file-input"
          type="file"
          accept={NATIVE_IMAGE_ACCEPT}
          multiple
          aria-label="Choose images for new note"
          onChange={(event) => chooseFiles('image', event)}
        />
        <input
          ref={scanInputRef}
          className="attachment-file-input"
          type="file"
          accept={NATIVE_IMAGE_ACCEPT}
          capture="environment"
          aria-label="Scan image for new note"
          onChange={(event) => chooseFiles('scan', event)}
        />

        <p className="capture-menu-hint">C creates text instantly · Shift+C creates a checklist</p>
      </div>
    </div>
  );
}

function CaptureAction({
  buttonRef,
  icon,
  label,
  description,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  icon: ReactNode;
  label: string;
  description: string;
  onClick(): void;
}) {
  return (
    <button ref={buttonRef} className="capture-menu-action" type="button" onClick={onClick}>
      <span className="capture-menu-action-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}
