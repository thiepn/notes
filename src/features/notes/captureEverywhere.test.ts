import { describe, expect, it } from 'vitest';

import {
  buildClipboardCapture,
  buildLinkCapture,
  buildTemplateCapture,
  linkTitleFromUrl,
  normalizeHttpUrl,
} from './captureEverywhere';

describe('P16 capture everywhere helpers', () => {
  it('keeps ordinary clipboard text intact without inventing a title', () => {
    expect(buildClipboardCapture('  First line\n\nSecond line  ')).toEqual({
      title: '',
      content: 'First line\n\nSecond line',
    });
  });

  it('recognizes a URL-only clipboard payload as a bookmark capture', () => {
    expect(buildClipboardCapture('https://www.example.com/docs?q=notes')).toEqual({
      title: 'example.com',
      content: 'https://www.example.com/docs?q=notes',
    });
  });

  it('accepts only HTTP(S) links and derives a compact hostname title', () => {
    expect(buildLinkCapture('https://www.openai.com/research')).toEqual({
      title: 'openai.com',
      content: 'https://www.openai.com/research',
    });
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpUrl('not a url')).toBeNull();
    expect(linkTitleFromUrl('https://sub.example.test/path')).toBe('sub.example.test');
  });

  it('builds deterministic dated templates without creating a new note type', () => {
    const now = new Date(2026, 8, 11, 12, 30, 0);

    expect(buildTemplateCapture('meeting', now)).toMatchObject({
      title: 'Meeting — 2026-09-11',
      content: expect.stringContaining('## Decisions'),
    });
    expect(buildTemplateCapture('study', now)).toMatchObject({
      title: 'Study notes — 2026-09-11',
      content: expect.stringContaining('## Questions'),
    });
    expect(buildTemplateCapture('daily', now)).toMatchObject({
      title: 'Daily note — 2026-09-11',
      content: expect.stringContaining('## Highlights'),
    });
  });

  it('rejects empty clipboard content', () => {
    expect(buildClipboardCapture('   ')).toBeNull();
  });
});
