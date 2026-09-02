import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGO8E+DGwMDAwMDAxAADABrWAXZuhrHqAAAAAElFTkSuQmCC',
  'base64',
);

function silentWav(durationSeconds = 1, sampleRate = 8_000): number[] {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataSize = sampleCount;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  bytes.fill(128, 44);
  return Array.from(bytes);
}

async function seedMixedMedia(page: Page) {
  await page.goto('./');
  const wav = silentWav();
  return page.evaluate(
    async ({ png, wavBytes }) => {
      const db = await import('/notes/src/db/index.ts');
      const note = await new db.NotesRepository(db.notesDatabase).create({
        title: 'Media details',
        content: 'Derived attachment presentation only.',
      });
      const now = Date.now();
      await db.notesDatabase.attachments.bulkAdd([
        db.attachmentRecordSchema.parse({
          id: crypto.randomUUID(),
          noteId: note.id,
          name: 'tiny.png',
          mimeType: 'image/png',
          size: png.length,
          checksum: 'v36-image',
          data: new Blob([new Uint8Array(png)], { type: 'image/png' }),
          createdAt: now,
        }),
        db.attachmentRecordSchema.parse({
          id: crypto.randomUUID(),
          noteId: note.id,
          name: 'memo.wav',
          mimeType: 'audio/wav',
          size: wavBytes.length,
          checksum: 'v36-audio',
          data: new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' }),
          createdAt: now + 1,
        }),
        db.attachmentRecordSchema.parse({
          id: crypto.randomUUID(),
          noteId: note.id,
          name: 'brief.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          checksum: 'v36-pdf',
          data: new Blob(['%PDF-1.4\nmedia polish'], { type: 'application/pdf' }),
          createdAt: now + 2,
        }),
      ]);
      return { noteId: note.id, pngSize: png.length, wavSize: wavBytes.length };
    },
    { png: Array.from(PNG), wavBytes: wav },
  );
}

test('mixed attachment panels show useful derived totals, friendly types, and image download metadata', async ({
  page,
}) => {
  const seeded = await seedMixedMedia(page);
  await page.reload();

  await page.getByRole('button', { name: 'Open note: Media details' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  const panel = editor.getByRole('region', { name: 'Attachments' });
  await expect(panel).toBeVisible();

  const totalBytes = seeded.pngSize + seeded.wavSize + 2048;
  const kilobytes = totalBytes / 1024;
  const expectedTotal = `${kilobytes.toFixed(kilobytes >= 10 ? 1 : 2)} KB`;
  await expect(
    panel.getByText(new RegExp(`3 attachments · .*${expectedTotal.replace('.', '\\.')}`)),
  ).toBeVisible();
  await expect(panel.getByText('1 image · 1 recording · 1 file')).toBeVisible();

  const imageTile = panel.locator('.attachment-image-tile').filter({ hasText: 'tiny.png' });
  await expect(imageTile.getByText('PNG image', { exact: false })).toBeVisible();
  await expect(imageTile.getByText(/B|KB/u)).toBeVisible();
  await expect(imageTile.getByRole('button', { name: 'Download image: tiny.png' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await imageTile.getByRole('button', { name: 'Download image: tiny.png' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('tiny.png');

  const fileRow = panel.locator('.attachment-file-row').filter({ hasText: 'brief.pdf' });
  await expect(fileRow.getByText(/PDF document · 2\.00 KB/u)).toBeVisible();
});

test('lightbox exposes filename, dimensions, friendly type, and size without persisting derived data', async ({
  page,
}) => {
  await seedMixedMedia(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open note: Media details' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Open image: tiny.png' }).click();

  const lightbox = page.getByRole('dialog', { name: 'Image viewer: tiny.png' });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.getByText('tiny.png', { exact: true })).toBeVisible();
  await expect(lightbox.getByText(/3 × 2 · PNG image ·/u)).toBeVisible();
  await expect(lightbox.getByRole('button', { name: 'Download image: tiny.png' })).toBeVisible();

  const persistedKeys = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const attachment = (await db.notesDatabase.attachments.toArray()).find(
      (item) => item.name === 'tiny.png',
    );
    return attachment ? Object.keys(attachment).sort() : [];
  });
  expect(persistedKeys).not.toContain('width');
  expect(persistedKeys).not.toContain('height');
  expect(persistedKeys).not.toContain('duration');
});

test('voice rows expose friendly audio metadata and loaded duration', async ({ page }) => {
  await seedMixedMedia(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open note: Media details' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  const audioRow = editor.locator('.attachment-audio-row').filter({ hasText: 'memo.wav' });

  await expect(audioRow.getByText(/WAV audio/u)).toBeVisible();
  await expect(audioRow.getByText(/0:01 · WAV audio/u)).toBeVisible();
  await expect(
    audioRow.getByRole('button', { name: 'Download voice recording: memo.wav' }),
  ).toBeVisible();
});
