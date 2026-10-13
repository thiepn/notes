import { describe, expect, it } from 'vitest';
import type { BackupDocument } from './backupFormat';
import { compareOriginalNotesBackups, originalNotesHandoffAdvice } from './handoffReconciliation';

function document(): BackupDocument {
  return {
    format: 'thiepn.notes.backup',
    formatVersion: 2,
    databaseVersion: 3,
    exportedAt: 5000,
    data: {
      notes: [{ id: 'one', text: 'alpha', updatedAt: 2 }],
      checklistItems: [],
      labels: [],
      noteLabels: [],
      attachments: [
        {
          id: 'file1',
          noteId: 'one',
          name: 'book.pdf',
          size: 4,
          mimeType: 'application/pdf',
          dataBase64: 'AAAAAA==',
          dataSha256: 'a'.repeat(64),
          createdAt: 200,
        },
      ],
      reminders: [],
      revisions: [{ id: 'rev-1', noteId: 'one', content: 'one' }],
      settings: [],
    },
  } as unknown as BackupDocument;
}
describe('B25 original Notes handoff reconciliation', () => {
  it('ignores file export timestamps and physical record order, never exposing note content', async () => {
    const original = document();
    const second = structuredClone(original);
    second.exportedAt = 6000;
    const result = await compareOriginalNotesBackups(original, second);
    expect(result.status).toBe('matched');
    expect(result.categories).toHaveLength(8);
    expect(JSON.stringify(result)).not.toContain('alpha');
    expect(result.externalCustody).toBe('NOT_TESTED');
  });
  it('detects changed note content even with identical counts', async () => {
    const a = document();
    const b = structuredClone(a);
    (b.data.notes[0] as unknown as { text: string }).text = 'changed';
    const finding = await compareOriginalNotesBackups(a, b);
    expect(finding.status).toBe('different');
    expect(finding.changedLabels).toContain('Notes');
    expect(finding.sourceRecords).toBe(finding.deviceRecords);
    expect(originalNotesHandoffAdvice(finding)).toMatch(/full-replacement restore/);
  });
  it('detects changed attachment bytes via independently validated backup digest', async () => {
    const a = document();
    const b = structuredClone(a);
    b.data.attachments[0].dataSha256 = 'b'.repeat(64);
    const finding = await compareOriginalNotesBackups(a, b);
    expect(finding.changedLabels).toContain('Attachments');
  });
  it('detects changed revision history without requiring a note count difference', async () => {
    const a = document();
    const b = structuredClone(a);
    (b.data.revisions[0] as unknown as { content: string }).content = 'two';
    const finding = await compareOriginalNotesBackups(a, b);
    expect(finding.changedLabels).toEqual(['Saved versions']);
  });
});
