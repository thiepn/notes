import { describe, expect, it } from 'vitest';

import type { NoteRecord, ReminderRecord } from '../db';
import { projectNotesHubSummary } from './notesHubSummary';

const now = new Date('2026-10-16T08:00:00Z');
function note(
  id: string,
  title: string,
  patch: Partial<NoteRecord> = {},
): NoteRecord {
  return {
    id,
    title,
    type: 'text',
    content: 'Private note body must never leave Notes.',
    color: 'default',
    createdAt: 1000,
    updatedAt: 2000,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
    ...patch,
  };
}
function reminder(
  id: string,
  noteId: string,
  patch: Partial<ReminderRecord> = {},
): ReminderRecord {
  return {
    id,
    noteId,
    dueAt: now.getTime() + 60_000,
    status: 'active',
    timeZone: 'Europe/Berlin',
    createdAt: 1000,
    updatedAt: 2000,
    completedAt: null,
    dismissedAt: null,
    lastNotifiedAt: null,
    ...patch,
  };
}
describe('Notes-owned Hub one-shot projection', () => {
  it('excludes Trash and Archive, complete reminders and all note bodies', () => {
    const summary = projectNotesHubSummary(
      [
        note('recent', 'Recent study note', { updatedAt: now.getTime(), pinnedAt: 1000 }),
        note('trash', 'Do not show trash', { trashedAt: 1000 }),
        note('archive', 'Do not show archive', { archivedAt: 1000 }),
      ],
      [
        reminder('r1', 'recent'),
        reminder('r2', 'trash'),
        reminder('r3', 'recent', { status: 'completed', completedAt: 1000 }),
      ],
      now,
    );
    expect(summary.source).toBe('notes-local-device');
    expect(summary.activeCount).toBe(1);
    expect(summary.notes).toMatchObject([
      { id: 'recent', title: 'Recent study note', pinned: true },
    ]);
    expect(summary.reminders.map((item) => item.id)).toEqual(['r1']);
    expect(JSON.stringify(summary)).not.toMatch(/Private note body|Do not show|content|passcode/);
  });
  it('caps summary, keeps stable date order and sanitizes empty titles', () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      note('n' + i, i === 0 ? '\u0000' : 'Note ' + i, { updatedAt: now.getTime() - i }),
    );
    const summary = projectNotesHubSummary(many, [], now);
    expect(summary.activeCount).toBe(23);
    expect(summary.notes).toHaveLength(8);
    expect(summary.notes[0]?.title).toBe('Untitled note');
    expect(summary.generatedAt).toBe('2026-10-16T08:00:00.000Z');
  });
});
