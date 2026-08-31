import { describe, expect, it } from 'vitest';

import { nextTimestamp } from './clock';
import { createNoteInputSchema, noteRecordSchema } from './validation';

describe('database validation', () => {
  it('applies stable defaults for a new text note', () => {
    expect(createNoteInputSchema.parse({})).toEqual({
      type: 'text',
      title: '',
      content: '',
      color: 'default',
      position: 0,
    });
  });

  it('rejects malformed persisted notes', () => {
    const result = noteRecordSchema.safeParse({
      id: 'not-a-uuid',
      type: 'text',
      title: '',
      content: '',
      color: 'default',
      createdAt: 1,
      updatedAt: 1,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      position: 0,
      revision: 1,
    });

    expect(result.success).toBe(false);
  });

  it('keeps update timestamps strictly monotonic', () => {
    expect(nextTimestamp(100, 100)).toBe(101);
    expect(nextTimestamp(100, 500)).toBe(500);
  });

  it('rejects invalid clock values', () => {
    expect(() => nextTimestamp(10, -1)).toThrow(RangeError);
    expect(() => nextTimestamp(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
