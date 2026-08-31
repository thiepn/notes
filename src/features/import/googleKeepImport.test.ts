import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { prepareGoogleKeepImport } from './googleKeepImport';

function takeoutFile(entries: Record<string, Uint8Array>, name = 'takeout.zip'): File {
  const zipped = zipSync(entries);
  return new File([Uint8Array.from(zipped).buffer], name, { type: 'application/zip' });
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

describe('P13 Google Keep Takeout parser', () => {
  it('maps Keep text metadata, labels, color, timestamps, and attachment bytes', async () => {
    const file = takeoutFile({
      'Takeout/Keep/Travel.json': json({
        color: 'CERULEAN',
        isTrashed: false,
        isPinned: true,
        isArchived: false,
        textContent: 'Flight details',
        title: 'Travel',
        userEditedTimestampUsec: 1_780_000_100_000_000,
        createdTimestampUsec: 1_780_000_000_000_000,
        labels: [{ name: 'Trips' }, { name: ' trips ' }],
        attachments: [{ filePath: 'ticket.png', mimetype: 'image/png' }],
      }),
      'Takeout/Keep/ticket.png': strToU8('image-bytes'),
      'Takeout/Keep/Travel.html': strToU8('<html>ignored</html>'),
    });

    const prepared = await prepareGoogleKeepImport([file]);
    const note = prepared.notes[0];

    expect(prepared.stats.importableNotes).toBe(1);
    expect(prepared.stats.labels).toBe(1);
    expect(prepared.stats.attachments).toBe(1);
    expect(note?.type).toBe('text');
    expect(note?.content).toBe('Flight details');
    expect(note?.color).toBe('blue');
    expect(note?.pinned).toBe(true);
    expect(note?.createdAt).toBe(1_780_000_000_000);
    expect(note?.updatedAt).toBe(1_780_000_100_000);
    expect(note?.labels).toEqual(['Trips']);
    expect(await note?.attachments[0]?.data.text()).toBe('image-bytes');
    expect(note?.attachments[0]?.checksum).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('preserves checklist check state and collapses deeper nesting safely', async () => {
    const file = takeoutFile({
      'Keep/List.json': json({
        color: 'GREEN',
        isPinned: false,
        isArchived: true,
        listContent: [
          {
            text: 'Parent',
            isChecked: false,
            childItems: [
              {
                text: 'Child',
                isChecked: true,
                childItems: [{ text: 'Grandchild', isChecked: false }],
              },
            ],
          },
        ],
        title: 'Packing',
        createdTimestampUsec: '1780000000000000',
        userEditedTimestampUsec: '1780000100000000',
      }),
    });

    const prepared = await prepareGoogleKeepImport([file]);
    const note = prepared.notes[0];

    expect(note?.type).toBe('checklist');
    expect(note?.archived).toBe(true);
    expect(note?.items).toEqual([
      { text: 'Parent', checked: false, parentIndex: null },
      { text: 'Child', checked: true, parentIndex: 0 },
      { text: 'Grandchild', checked: false, parentIndex: 0 },
    ]);
    expect(prepared.warnings.some((warning) => warning.message.includes('flattened'))).toBe(true);
  });

  it('recognizes a previously imported source and removes it from the pending import', async () => {
    const file = takeoutFile({
      'Keep/One.json': json({
        color: 'DEFAULT',
        isPinned: false,
        isArchived: false,
        title: 'One',
        textContent: 'Body',
        createdTimestampUsec: 1_780_000_000_000_000,
        userEditedTimestampUsec: 1_780_000_000_000_000,
      }),
    });
    const first = await prepareGoogleKeepImport([file]);
    const sourceKey = first.notes[0]?.sourceKey;
    expect(sourceKey).toBeTruthy();

    const second = await prepareGoogleKeepImport([file], new Set(sourceKey ? [sourceKey] : []));
    expect(second.notes).toHaveLength(0);
    expect(second.stats.alreadyImportedNotes).toBe(1);
  });

  it('keeps valid notes importable when another JSON file or attachment is damaged', async () => {
    const file = takeoutFile({
      'Takeout/Keep/Good.json': json({
        color: 'UNKNOWN_COLOR',
        isPinned: false,
        isArchived: false,
        title: 'Good',
        textContent: 'Still import this',
        createdTimestampUsec: 1_780_000_000_000_000,
        attachments: [{ filePath: 'missing.jpg', mimetype: 'image/jpeg' }],
      }),
      'Takeout/Keep/Broken.json': strToU8('{not-json'),
    });

    const prepared = await prepareGoogleKeepImport([file]);
    expect(prepared.notes).toHaveLength(1);
    expect(prepared.notes[0]?.color).toBe('default');
    expect(prepared.stats.skippedNotes).toBe(1);
    expect(prepared.stats.missingAttachments).toBe(1);
    expect(prepared.stats.warningCount).toBeGreaterThanOrEqual(3);
  });
});
