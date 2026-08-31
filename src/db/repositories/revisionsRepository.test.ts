import { describe, expect, it } from 'vitest';

import { parseRevisionPayload, serializeRevisionSnapshot } from './revisionsRepository';

const parentId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';

describe('revision payloads', () => {
  it('round-trips a checklist snapshot with parent relationships', () => {
    const payload = serializeRevisionSnapshot({
      version: 1,
      type: 'checklist',
      title: 'Plan',
      content: '',
      color: 'blue',
      items: [
        { id: parentId, text: 'Parent', checked: false, parentId: null },
        { id: childId, text: 'Child', checked: true, parentId },
      ],
    });

    expect(parseRevisionPayload(payload)).toEqual({
      version: 1,
      type: 'checklist',
      title: 'Plan',
      content: '',
      color: 'blue',
      items: [
        { id: parentId, text: 'Parent', checked: false, parentId: null },
        { id: childId, text: 'Child', checked: true, parentId },
      ],
    });
  });

  it('rejects malformed JSON', () => {
    expect(() => parseRevisionPayload('{not-json')).toThrow(/corrupted/i);
  });

  it('rejects text snapshots that contain checklist rows', () => {
    const payload = JSON.stringify({
      version: 1,
      type: 'text',
      title: 'Invalid',
      content: 'Body',
      color: 'default',
      items: [{ id: parentId, text: 'Unexpected', checked: false, parentId: null }],
    });

    expect(() => parseRevisionPayload(payload)).toThrow(/text-note revision/i);
  });

  it('rejects checklist children whose parent is not already present', () => {
    const payload = JSON.stringify({
      version: 1,
      type: 'checklist',
      title: 'Invalid',
      content: '',
      color: 'default',
      items: [{ id: childId, text: 'Orphan', checked: false, parentId }],
    });

    expect(() => parseRevisionPayload(payload)).toThrow(/parent must appear before/i);
  });
});
