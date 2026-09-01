export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'deu', label: 'German' },
  { code: 'fra', label: 'French' },
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]['code'];

export interface OcrProgress {
  status: string;
  progress: number | null;
}

export interface OcrResult {
  text: string;
  confidence: number | null;
}

const OCR_LANGUAGE_KEY = 'notes.ocr.language';

export async function recognizeImageText(
  image: Blob,
  language: OcrLanguage,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: OcrProgress) => void;
  } = {},
): Promise<OcrResult> {
  if (options.signal?.aborted) throw abortError();

  const { createWorker, OEM } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let aborted = false;

  const handleAbort = () => {
    aborted = true;
    if (worker) void worker.terminate();
  };
  options.signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const base = import.meta.env.BASE_URL;
    worker = await createWorker(language, OEM.LSTM_ONLY, {
      workerPath: `${base}ocr/worker.min.js`,
      corePath: `${base}ocr/core`,
      langPath: `${base}ocr/lang`,
      logger: (message) => {
        if (aborted) return;
        options.onProgress?.({
          status: humanizeOcrStatus(message.status),
          progress:
            typeof message.progress === 'number' && Number.isFinite(message.progress)
              ? clamp01(message.progress)
              : null,
        });
      },
    });

    if (aborted || options.signal?.aborted) throw abortError();
    const result = await worker.recognize(image);
    if (aborted || options.signal?.aborted) throw abortError();

    return {
      text: normalizeOcrText(result.data.text),
      confidence:
        typeof result.data.confidence === 'number' && Number.isFinite(result.data.confidence)
          ? Math.max(0, Math.min(100, result.data.confidence))
          : null,
    };
  } catch (error) {
    if (aborted || options.signal?.aborted) throw abortError();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', handleAbort);
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // A worker terminated by AbortController may already be gone.
      }
    }
  }
}

export function normalizeOcrText(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/gu, ''))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function appendOcrText(content: string, extractedText: string): string {
  const normalized = normalizeOcrText(extractedText);
  if (!normalized) return content;
  const prefix = content.trim() ? `${content.trimEnd()}\n\n` : '';
  return `${prefix}## Extracted text\n\n${normalized}`;
}

export function readOcrLanguage(): OcrLanguage {
  try {
    const value = window.localStorage.getItem(OCR_LANGUAGE_KEY);
    if (isOcrLanguage(value)) return value;
  } catch {
    // Preference persistence is best effort.
  }
  return 'eng';
}

export function writeOcrLanguage(language: OcrLanguage): void {
  try {
    window.localStorage.setItem(OCR_LANGUAGE_KEY, language);
  } catch {
    // Preference persistence is best effort.
  }
}

export function humanizeOcrStatus(status: string): string {
  const normalized = status.trim().toLocaleLowerCase();
  if (normalized.includes('recognizing text')) return 'Recognizing text';
  if (normalized.includes('loading language')) return 'Loading language data';
  if (normalized.includes('initializing api')) return 'Preparing recognition';
  if (normalized.includes('initializing tesseract')) return 'Starting OCR engine';
  if (normalized.includes('loading tesseract core')) return 'Loading OCR engine';
  return status.trim() || 'Working';
}

function isOcrLanguage(value: string | null): value is OcrLanguage {
  return OCR_LANGUAGES.some((language) => language.code === value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function abortError(): DOMException {
  return new DOMException('OCR was cancelled.', 'AbortError');
}
