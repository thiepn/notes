import { describe, expect, it } from 'vitest';

import { applyRichTextCommand, richTextToPlainText } from './richText';

describe('rich text commands', () => {
  it('wraps the active selection without losing text', () => {
    expect(applyRichTextCommand('Alpha beta', 6, 10, 'bold')).toEqual({
      value: 'Alpha **beta**',
      selectionStart: 8,
      selectionEnd: 12,
    });
  });

  it('creates an editable link target for selected text', () => {
    expect(applyRichTextCommand('Read docs', 5, 9, 'link')).toEqual({
      value: 'Read [docs](https://)',
      selectionStart: 12,
      selectionEnd: 20,
    });
  });

  it('turns selected lines into and out of a bulleted list', () => {
    const applied = applyRichTextCommand('one\ntwo', 0, 7, 'bulletList');
    expect(applied.value).toBe('- one\n- two');
    expect(applyRichTextCommand(applied.value, 0, applied.value.length, 'bulletList').value).toBe(
      'one\ntwo',
    );
  });

  it('numbers multiple selected lines in document order', () => {
    expect(applyRichTextCommand('first\nsecond\nthird', 0, 18, 'orderedList').value).toBe(
      '1. first\n2. second\n3. third',
    );
  });

  it('keeps stored formatting out of plain-text search and labels', () => {
    expect(
      richTextToPlainText(
        '## Heading\n\n**Bold** and *italic* with [Docs](https://example.com).\n> Quoted\n- Item',
      ),
    ).toBe('Heading\n\nBold and italic with Docs https://example.com.\nQuoted\nItem');
  });
});
