import { describe, expect, it } from 'vitest';

import { appendOcrText, humanizeOcrStatus, normalizeOcrText } from './ocr';

describe('OCR helpers', () => {
  it('normalizes line endings, outer whitespace, trailing whitespace, and excessive blank lines', () => {
    expect(normalizeOcrText('  First line  \r\n\r\n\r\nSecond line\t\r\n')).toBe(
      'First line\n\nSecond line',
    );
  });

  it('appends extracted text as deterministic Markdown-compatible note content', () => {
    expect(appendOcrText('Existing body\n', 'Scanned text')).toBe(
      'Existing body\n\n## Extracted text\n\nScanned text',
    );
  });

  it('uses the extraction section directly for an empty note', () => {
    expect(appendOcrText('', 'Scanned text')).toBe('## Extracted text\n\nScanned text');
  });

  it('does not change note content for an empty OCR result', () => {
    expect(appendOcrText('Keep me', ' \n\n ')).toBe('Keep me');
  });

  it('turns Tesseract status strings into user-facing progress labels', () => {
    expect(humanizeOcrStatus('loading tesseract core')).toBe('Loading OCR engine');
    expect(humanizeOcrStatus('loading language traineddata')).toBe('Loading language data');
    expect(humanizeOcrStatus('recognizing text')).toBe('Recognizing text');
  });
});
