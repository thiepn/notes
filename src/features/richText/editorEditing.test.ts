import { describe, expect, it } from 'vitest';

import {
  applySlashCommand,
  continueRichTextBlock,
  findSlashCommand,
  linkSelectionWithPastedUrl,
} from './editorEditing';

describe('P12 editor interactions', () => {
  it('detects slash commands only at the start of the active line', () => {
    expect(findSlashCommand('/hea', 4, 4)).toEqual({ query: 'hea', start: 0, end: 4 });
    expect(findSlashCommand('Intro\n/code', 11, 11)).toEqual({
      query: 'code',
      start: 6,
      end: 11,
    });
    expect(findSlashCommand('Text /hea', 9, 9)).toBeNull();
    expect(findSlashCommand('/hea', 1, 4)).toBeNull();
  });

  it('replaces the slash query with the chosen block command', () => {
    const match = findSlashCommand('/heading', 8, 8);
    expect(match).not.toBeNull();
    expect(applySlashCommand('/heading', match!, 'heading')).toEqual({
      value: '## ',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('continues bullet, numbered, and quote blocks on Enter', () => {
    expect(continueRichTextBlock('- alpha', 7, 7)).toEqual({
      value: '- alpha\n- ',
      selectionStart: 10,
      selectionEnd: 10,
    });
    expect(continueRichTextBlock('4. alpha', 8, 8)).toEqual({
      value: '4. alpha\n5. ',
      selectionStart: 12,
      selectionEnd: 12,
    });
    expect(continueRichTextBlock('> alpha', 7, 7)).toEqual({
      value: '> alpha\n> ',
      selectionStart: 10,
      selectionEnd: 10,
    });
  });

  it('exits an empty list or quote block instead of creating another marker', () => {
    expect(continueRichTextBlock('- alpha\n- ', 10, 10)).toEqual({
      value: '- alpha\n',
      selectionStart: 8,
      selectionEnd: 8,
    });
    expect(continueRichTextBlock('> quote\n> ', 10, 10)).toEqual({
      value: '> quote\n',
      selectionStart: 8,
      selectionEnd: 8,
    });
  });

  it('turns a pasted URL into a link when text is selected', () => {
    expect(linkSelectionWithPastedUrl('Read the docs today', 9, 13, 'https://example.com')).toEqual({
      value: 'Read the [docs](https://example.com) today',
      selectionStart: 32,
      selectionEnd: 32,
    });
    expect(linkSelectionWithPastedUrl('No selection', 2, 2, 'https://example.com')).toBeNull();
    expect(linkSelectionWithPastedUrl('two\nlines', 0, 9, 'https://example.com')).toBeNull();
    expect(linkSelectionWithPastedUrl('docs', 0, 4, 'not a url')).toBeNull();
  });
});
