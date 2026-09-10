import { describe, expect, it } from 'vitest';

import { encodeSharePayload, parseLaunchIntent } from './launchIntent';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const LABEL_ID = '22222222-2222-4222-8222-222222222222';

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

  it('ignores malformed identifiers and unsupported launch values', () => {
    const intent = parseLaunchIntent(
      new URL('https://example.test/notes/?view=unknown&capture=voice&note=nope&label=also-nope'),
    );

    expect(intent).toBeNull();
  });

  it('decodes private fragment share payloads and avoids repeating an already-shared URL', () => {
    const payload = encodeSharePayload({
      title: 'Shared research',
      text: 'Read https://example.test/article before Friday.',
      url: 'https://example.test/article',
    });
    const intent = parseLaunchIntent(new URL(`https://example.test/notes/#share=${payload}`));

    expect(intent?.sharedNote).toEqual({
      title: 'Shared research',
      content: 'Read https://example.test/article before Friday.',
    });
  });

  it('combines shared text and a distinct URL', () => {
    const payload = encodeSharePayload({
      title: 'Reference',
      text: 'Useful documentation',
      url: 'https://example.test/docs',
    });
    const intent = parseLaunchIntent(new URL(`https://example.test/notes/#share=${payload}`));

    expect(intent?.sharedNote).toEqual({
      title: 'Reference',
      content: 'Useful documentation\n\nhttps://example.test/docs',
    });
  });

  it('rejects malformed share fragments without breaking other deep links', () => {
    const intent = parseLaunchIntent(
      new URL('https://example.test/notes/?view=search&q=algebra#share=not-valid-base64'),
    );

    expect(intent).toEqual({ view: 'search', searchQuery: 'algebra' });
  });
});
