import { useRef, useState, type ChangeEvent, type ReactNode, type Ref } from 'react';
import {
  ArrowLeft,
  Camera,
  ClipboardPaste,
  ImagePlus,
  LayoutTemplate,
  Link2,
  ListChecks,
  Mic,
  PencilLine,
  StickyNote,
  X,
} from 'lucide-react';

import { dispatchAppEvent } from '../../app/events';
import { IconButton } from '../../components/ui/IconButton';
import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';
import { LabelsRepository, NATIVE_IMAGE_ACCEPT, NotesRepository, notesDatabase } from '../../db';
import { requestLinkedNoteOpen } from '../links/navigation';
import {
  CAPTURE_TEMPLATES,
  buildClipboardCapture,
  buildLinkCapture,
  buildTemplateCapture,
  type CaptureTemplateId,
  type PrefilledTextCapture,
} from './captureEverywhere';
import type { CaptureKind } from './captureTypes';

const ACTIVE_SECTION_KEY = 'notes.active-section';
const ACTIVE_LABEL_KEY = 'notes.active-label';
const OPEN_ATTEMPTS = 60;
const OPEN_RETRY_MS = 50;
const notesRepository = new NotesRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);

type CapturePanel = 'root' | 'link' | 'templates';

interface CaptureMenuProps {
  onClose(): void;
  onCapture(kind: CaptureKind, files?: File[]): void;
}

export function CaptureMenu({ onClose, onCapture }: CaptureMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const sourceBackRef = useRef<HTMLButtonElement>(null);
  const linkTriggerRef = useRef<HTMLButtonElement>(null);
  const templateTriggerRef = useRef<HTMLButtonElement>(null);
  const rootReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [panel, setPanel] = useState<CapturePanel>('root');
  const [linkValue, setLinkValue] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: firstActionRef });

  const chooseFiles = (kind: 'image' | 'scan', event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    onCapture(kind, files);
  };

  const createPrefilledNote = async (capture: PrefilledTextCapture) => {
    setBusy(true);
    setSourceError(null);
    try {
      const created = await notesRepository.create({
        title: capture.title,
        content: capture.content,
      });
      const preserveLabelView = await inheritActiveLabel(created.id);
      dispatchAppEvent('cloudSyncApplied');
      onClose();
      if (preserveLabelView && (await openCapturedCard(created.id))) return;
      await requestLinkedNoteOpen(created.id);
    } catch {
      setSourceError('That capture could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const captureClipboard = async () => {
    setSourceError(null);
    if (!navigator.clipboard?.readText) {
      setSourceError('Clipboard access is not available in this browser.');
      return;
    }

    setBusy(true);
    try {
      const capture = buildClipboardCapture(await navigator.clipboard.readText());
      if (!capture) {
        setSourceError('The clipboard does not contain text or a web link.');
        return;
      }
      await createPrefilledNote(capture);
    } catch {
      setSourceError('Clipboard access was blocked. Allow clipboard access and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitLink = async () => {
    const capture = buildLinkCapture(linkValue);
    if (!capture) {
      setSourceError('Enter a valid http:// or https:// web address.');
      linkInputRef.current?.focus();
      return;
    }
    await createPrefilledNote(capture);
  };

  const captureTemplate = async (templateId: CaptureTemplateId) => {
    await createPrefilledNote(buildTemplateCapture(templateId));
  };

  const openSourcePanel = (
    nextPanel: Exclude<CapturePanel, 'root'>,
    returnFocus: HTMLButtonElement | null,
  ) => {
    setSourceError(null);
    rootReturnFocusRef.current = returnFocus;
    setPanel(nextPanel);
    window.requestAnimationFrame(() => {
      if (nextPanel === 'link') linkInputRef.current?.focus({ preventScroll: true });
      else sourceBackRef.current?.focus({ preventScroll: true });
    });
  };

  const goBack = () => {
    const returnTarget = rootReturnFocusRef.current;
    setSourceError(null);
    setPanel('root');
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      else firstActionRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div
      className="capture-menu-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="capture-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-menu-title"
        aria-busy={busy}
        tabIndex={-1}
      >
        <header className="capture-menu-header">
          <div>
            <p className="workspace-kicker">Capture</p>
            <h2 id="capture-menu-title">
              {panel === 'root' ? 'New' : panel === 'link' ? 'Web link' : 'Templates'}
            </h2>
          </div>
          <IconButton label="Close new note menu" disabled={busy} onClick={onClose}>
            <X />
          </IconButton>
        </header>

        {panel === 'root' ? (
          <>
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

            <section className="capture-everywhere" aria-labelledby="capture-everywhere-title">
              <h3 id="capture-everywhere-title">Quick start</h3>
              <div className="capture-everywhere-actions">
                <QuickStartAction
                  icon={<ClipboardPaste />}
                  label="Clipboard"
                  disabled={busy}
                  onClick={() => void captureClipboard()}
                />
                <QuickStartAction
                  buttonRef={linkTriggerRef}
                  icon={<Link2 />}
                  label="Web link"
                  disabled={busy}
                  onClick={() => openSourcePanel('link', linkTriggerRef.current)}
                />
                <QuickStartAction
                  buttonRef={templateTriggerRef}
                  icon={<LayoutTemplate />}
                  label="Template"
                  disabled={busy}
                  onClick={() => openSourcePanel('templates', templateTriggerRef.current)}
                />
              </div>
            </section>
          </>
        ) : panel === 'link' ? (
          <div className="capture-source-panel">
            <button
              ref={sourceBackRef}
              className="capture-source-back"
              type="button"
              disabled={busy}
              onClick={goBack}
            >
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <p>Save a web address as a normal note. The site name becomes the initial title.</p>
            <form
              className="capture-link-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submitLink();
              }}
            >
              <label>
                <span>Web address</span>
                <input
                  ref={linkInputRef}
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://example.com/article"
                  value={linkValue}
                  disabled={busy}
                  aria-invalid={Boolean(sourceError)}
                  aria-describedby={sourceError ? 'capture-source-error' : undefined}
                  onChange={(event) => {
                    setSourceError(null);
                    setLinkValue(event.target.value);
                  }}
                />
              </label>
              <button className="capture-source-primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save link'}
              </button>
            </form>
          </div>
        ) : (
          <div className="capture-source-panel">
            <button
              ref={sourceBackRef}
              className="capture-source-back"
              type="button"
              disabled={busy}
              onClick={goBack}
            >
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <p>Use a lightweight structure, then edit it like any other text note.</p>
            <div className="capture-template-list">
              {CAPTURE_TEMPLATES.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  disabled={busy}
                  onClick={() => void captureTemplate(template.id)}
                >
                  <LayoutTemplate aria-hidden="true" />
                  <span>
                    <strong>{template.label}</strong>
                    <small>{template.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <input
          ref={imageInputRef}
          className="attachment-file-input"
          type="file"
          accept={NATIVE_IMAGE_ACCEPT}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseFiles('image', event)}
        />
        <input
          ref={scanInputRef}
          className="attachment-file-input"
          type="file"
          accept={NATIVE_IMAGE_ACCEPT}
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => chooseFiles('scan', event)}
        />

        {sourceError ? (
          <p id="capture-source-error" className="capture-source-error" role="alert">
            {sourceError}
          </p>
        ) : null}

        {panel === 'root' ? (
          <p className="capture-menu-hint">
            C creates text instantly · Shift+C creates a checklist
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function inheritActiveLabel(noteId: string): Promise<boolean> {
  try {
    if (document.querySelector('.workspace-search-active')) return false;
    if (localStorage.getItem(ACTIVE_SECTION_KEY) !== 'notes') return false;
    const labelId = localStorage.getItem(ACTIVE_LABEL_KEY)?.trim();
    if (!labelId || !(await labelsRepository.get(labelId))) return false;
    await labelsRepository.assign(noteId, labelId);
    return true;
  } catch {
    // A capture should remain usable if convenience navigation state or label assignment fails.
    return false;
  }
}

async function openCapturedCard(noteId: string): Promise<boolean> {
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    const card = document.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(noteId)}"]`);
    const openButton = card?.querySelector<HTMLButtonElement>('.note-card-open');
    if (openButton) {
      openButton.click();
      return true;
    }
    await delay(OPEN_RETRY_MS);
  }
  return false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

function QuickStartAction({
  buttonRef,
  icon,
  label,
  disabled,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button ref={buttonRef} type="button" disabled={disabled} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
