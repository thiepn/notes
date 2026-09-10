import { describe, expect, it } from 'vitest';

import { parseLaunchIntent, sanitizeSharedPayload, sharePayloadPath } from './launchIntent';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const LABEL_ID = '22222222-2222-4222-8222-222222222222';
const SHARE_KEY = '33333333-3333-4333-8333-333333333333';

describe('parseLaunchIntent', () => {
  it('accepts supported workspace, capture, note, label, and search intents', () => {
    const intent = parseLaunchIntent(
      new URL(
        `https://example.test/notes/?view=archive&capture=checklist&note=${NOTE_ID}&label=${LABEL_ID}&q=matrix`,
      ),
    );

    expect(intent).toMatchObject({
      view: 'archive',
      capture: 'checklist',
      noteId: NOTE_ID,
      labelId: LABEL_ID,
      searchQuery: 'matrix',
    });
  });

  it('accepts only UUID share tokens and maps them to the private payload path', () => {
    const intent = parseLaunchIntent(new URL(`https://example.test/notes/#share=${SHARE_KEY}`));

    expect(intent).toEqual({ shareKey: SHARE_KEY });
    expect(sharePayloadPath(SHARE_KEY)).toBe(`/notes/share-payload/${SHARE_KEY}`);
  });

  it('ignores malformed identifiers and unsupported launch values', () => {
    const intent = parseLaunchIntent(
      new URL('https://example.test/notes/?view=unknown&capture=voice&note=nope&label=also-nope'),
    );

    expect(intent).toBeNull();
  });

  it('rejects malformed share tokens without breaking other deep links', () => {
    const intent = parseLaunchIntent(
      new URL('https://example.test/notes/?view=search&q=algebra#share=not-a-token'),
    );

    expect(intent).toEqual({ view: 'search', searchQuery: 'algebra' });
  });
});

describe('sanitizeSharedPayload', () => {
  it('avoids repeating a URL already present in the shared text', () => {
    expect(
      sanitizeSharedPayload({
        title: 'Shared research',
        text: 'Read https://example.test/article before Friday.',
        url: 'https://example.test/article',
      }),
    ).toEqual({
      title: 'Shared research',
      content: 'Read https://example.test/article before Friday.',
    });
  });

  it('combines shared text and a distinct URL while ignoring unknown fields', () => {
    expect(
      sanitizeSharedPayload({
        title: 'Reference',
        text: 'Useful documentation',
        url: 'https://example.test/docs',
        ignored: 'not imported',
      }),
    ).toEqual({
      title: 'Reference',
      content: 'Useful documentation\n\nhttps://example.test/docs',
    });
  });

  it('rejects payloads without usable note content', () => {
    expect(sanitizeSharedPayload({ title: ' ', text: '', url: '' })).toBeNull();
    expect(sanitizeSharedPayload(null)).toBeNull();
  });
});
