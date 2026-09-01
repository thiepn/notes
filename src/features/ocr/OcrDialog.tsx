import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Clipboard, FilePlus2, RotateCcw, ScanText, X } from 'lucide-react';

import type { AttachmentRecord } from '../../db';
import {
  OCR_LANGUAGES,
  readOcrLanguage,
  recognizeImageText,
  writeOcrLanguage,
  type OcrLanguage,
  type OcrProgress,
} from './ocr';

type OcrPhase = 'running' | 'result' | 'empty' | 'error';

interface OcrDialogProps {
  attachment: AttachmentRecord;
  onAppend?: ((text: string) => Promise<void> | void) | undefined;
  onClose(): void;
}

export function OcrDialog({ attachment, onAppend, onClose }: OcrDialogProps) {
  const [language, setLanguage] = useState<OcrLanguage>(readOcrLanguage);
  const initialLanguageRef = useRef(language);
  const [phase, setPhase] = useState<OcrPhase>('running');
  const [progress, setProgress] = useState<OcrProgress>({ status: 'Preparing OCR', progress: null });
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [imageUrl] = useState(() => URL.createObjectURL(attachment.data));
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const closedRef = useRef(false);

  const run = useCallback(
    async (nextLanguage: OcrLanguage) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      writeOcrLanguage(nextLanguage);
      setPhase('running');
      setProgress({ status: 'Preparing OCR', progress: null });
      setErrorMessage(null);
      setStatusMessage(null);
      setConfidence(null);

      try {
        const result = await recognizeImageText(attachment.data, nextLanguage, {
          signal: controller.signal,
          onProgress: (nextProgress) => {
            if (mountedRef.current && !controller.signal.aborted) setProgress(nextProgress);
          },
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        setText(result.text);
        setConfidence(result.confidence);
        setPhase(result.text ? 'result' : 'empty');
      } catch (error) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setPhase('error');
        setErrorMessage(toOcrErrorMessage(error));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [attachment.data],
  );

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => void run(initialLanguageRef.current), 0);
    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      abortRef.current?.abort();
      document.body.style.overflow = previousOverflow;
    };
  }, [run]);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    abortRef.current?.abort();
    URL.revokeObjectURL(imageUrl);
    onClose();
  };

  const copy = async () => {
    if (!text.trim()) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage('Extracted text copied.');
    } catch {
      setErrorMessage('The browser could not copy the extracted text.');
    }
  };

  const append = async () => {
    if (!onAppend || !text.trim()) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await onAppend(text);
      close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The extracted text could not be added.',
      );
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const percent = progress.progress === null ? null : Math.round(progress.progress * 100);
  const label = attachment.name?.trim() || 'Attached image';

  return (
    <div
      className="ocr-dialog-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Extract text from image"
      onKeyDownCapture={handleKeyDown}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="ocr-dialog">
        <header className="ocr-dialog-header">
          <div>
            <strong>Extract text</strong>
            <span>Runs locally on this device</span>
          </div>
          <button type="button" aria-label="Close OCR" autoFocus onClick={close}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="ocr-dialog-body">
          <aside className="ocr-image-panel">
            <img src={imageUrl} alt={label} />
            <span title={label}>{label}</span>
          </aside>

          <section className="ocr-result-panel" aria-label="OCR result">
            <label className="ocr-language-field">
              <span>Recognition language</span>
              <select
                value={language}
                disabled={phase === 'running'}
                onChange={(event) => {
                  const next = event.target.value as OcrLanguage;
                  setLanguage(next);
                  void run(next);
                }}
              >
                {OCR_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {phase === 'running' ? (
              <div className="ocr-progress" aria-live="polite">
                <span className="ocr-progress-icon" aria-hidden="true">
                  <ScanText />
                </span>
                <strong>{progress.status}</strong>
                <div
                  className="ocr-progress-track"
                  role="progressbar"
                  aria-label="OCR progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? undefined}
                >
                  <span style={percent === null ? undefined : { width: `${percent}%` }} />
                </div>
                <span>{percent === null ? 'Loading local OCR assets…' : `${percent}%`}</span>
                <button type="button" onClick={close}>
                  Cancel
                </button>
              </div>
            ) : null}

            {phase === 'result' ? (
              <div className="ocr-text-result">
                <div>
                  <strong>Extracted text</strong>
                  {confidence !== null ? <span>{Math.round(confidence)}% confidence</span> : null}
                </div>
                <textarea
                  value={text}
                  aria-label="Extracted text"
                  spellCheck
                  onChange={(event) => setText(event.target.value)}
                />
                <span className="ocr-result-hint">Review and correct the text before adding it.</span>
              </div>
            ) : null}

            {phase === 'empty' ? (
              <div className="ocr-message-state" role="status">
                <ScanText aria-hidden="true" />
                <strong>No text found</strong>
                <span>Try another recognition language or a clearer image.</span>
              </div>
            ) : null}

            {phase === 'error' ? (
              <div className="ocr-message-state" role="alert">
                <ScanText aria-hidden="true" />
                <strong>OCR failed</strong>
                <span>{errorMessage}</span>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="ocr-dialog-footer">
          <div aria-live="polite">
            {statusMessage ? <span>{statusMessage}</span> : null}
            {phase === 'result' && errorMessage ? (
              <span className="ocr-error">{errorMessage}</span>
            ) : null}
          </div>
          <div>
            {phase !== 'running' ? (
              <button type="button" onClick={() => void run(language)}>
                <RotateCcw aria-hidden="true" /> Run again
              </button>
            ) : null}
            {phase === 'result' ? (
              <button type="button" onClick={() => void copy()}>
                <Clipboard aria-hidden="true" /> Copy text
              </button>
            ) : null}
            {phase === 'result' && onAppend ? (
              <button className="ocr-append-button" type="button" onClick={() => void append()}>
                <FilePlus2 aria-hidden="true" /> Add to note
              </button>
            ) : null}
            <button type="button" onClick={close}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function toOcrErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'OCR was cancelled.';
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The image could not be recognized on this device.';
}
