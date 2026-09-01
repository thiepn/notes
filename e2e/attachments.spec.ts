import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGO8E+DGwMDAwMDAxAADABrWAXZuhrHqAAAAAElFTkSuQmCC',
  'base64',
);
const METADATA_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAH3RFWHRBdXRob3IAU2VjcmV0IEdQUy1saWtlIG1ldGFkYXRhNeasPQAAABVJREFUeJxj5DmR/J8BCTAxoAEMAQBqzQI8A1tEogAAAABJRU5ErkJggg==',
  'base64',
);

function imageFile(name = 'pixel.png') {
  return { name, mimeType: 'image/png', buffer: PNG };
}

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

test('quick image capture preserves an attachment-only note and supports lightbox, dedupe, and removal', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  await page.getByLabel('Choose images for new note').setInputFiles(imageFile());

  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole('button', { name: 'Open image: pixel.png' })).toBeVisible();
  await composer.getByRole('button', { name: 'Close' }).click();

  const storedAfterCapture = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const [notes, attachments] = await Promise.all([
      db.notesDatabase.notes.toArray(),
      db.notesDatabase.attachments.toArray(),
    ]);
    return {
      notes: notes.map((note) => ({ id: note.id, title: note.title, content: note.content })),
      attachments: attachments.map((attachment) => ({
        noteId: attachment.noteId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        checksum: attachment.checksum,
      })),
    };
  });

  expect(storedAfterCapture.notes).toHaveLength(1);
  expect(storedAfterCapture.notes[0]).toEqual(expect.objectContaining({ title: '', content: '' }));
  expect(storedAfterCapture.attachments).toHaveLength(1);
  expect(storedAfterCapture.attachments[0]).toEqual(
    expect.objectContaining({ name: 'pixel.png', mimeType: 'image/png' }),
  );
  expect(storedAfterCapture.attachments[0]?.checksum).toMatch(/^[a-f0-9]{64}$/u);

  const card = page.locator('[data-note-card]').first();
  await expect(card.locator('.note-card-image-wrap img')).toBeVisible();
  await card.getByRole('button', { name: 'Open note: Untitled note' }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByRole('button', { name: 'Open image: pixel.png' })).toBeVisible();

  await editor.getByLabel('Choose images').setInputFiles(imageFile());
  await expect(editor.getByText('1 duplicate image was skipped.')).toBeVisible();
  const attachmentCountAfterDuplicate = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return db.notesDatabase.attachments.count();
  });
  expect(attachmentCountAfterDuplicate).toBe(1);

  await editor.getByRole('button', { name: 'Open image: pixel.png' }).click();
  const lightbox = page.getByRole('dialog', { name: 'Image viewer: pixel.png' });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lightbox).not.toBeVisible();
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: 'Open image: pixel.png' }).hover();
  await editor.getByRole('button', { name: 'Remove image: pixel.png' }).click();
  const removeGroup = editor.getByRole('group', { name: 'Remove pixel.png?' });
  await expect(removeGroup).toBeVisible();
  await removeGroup.getByRole('button', { name: 'Yes' }).click();
  await expect(editor.getByText('Attachment removed.')).toBeVisible();
  await editor.getByRole('button', { name: 'Close' }).click();

  const finalState = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return {
      noteCount: await db.notesDatabase.notes.count(),
      attachmentCount: await db.notesDatabase.attachments.count(),
    };
  });
  expect(finalState).toEqual({ noteCount: 1, attachmentCount: 0 });
});

test('clipboard image paste creates a local attachment without interfering with text paste', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.getByRole('button', { name: 'Create a text note' }).click();

  await page.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(bytes)], 'pasted.png', {
        type: 'image/png',
        lastModified: Date.now(),
      }),
    );
    document.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, Array.from(PNG));

  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer.getByText('1 image pasted.')).toBeVisible();
  await expect(composer.getByRole('button', { name: 'Open image: pasted.png' })).toBeVisible();
});

test('native static images are re-encoded without embedded text metadata', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);

  await page.getByLabel('Choose images for new note').setInputFiles({
    name: 'private.png',
    mimeType: 'image/png',
    buffer: METADATA_PNG,
  });
  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer.getByRole('button', { name: 'Open image: private.png' })).toBeVisible();

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const attachment = (await db.notesDatabase.attachments.toArray())[0];
    if (!attachment) return null;
    const bytes = new Uint8Array(await attachment.data.arrayBuffer());
    let ascii = '';
    for (const byte of bytes) ascii += String.fromCharCode(byte);
    return {
      name: attachment.name,
      mimeType: attachment.mimeType,
      containsPrivateMetadata: ascii.includes('Secret GPS-like metadata'),
    };
  });

  expect(stored).toEqual({
    name: 'private.png',
    mimeType: 'image/png',
    containsPrivateMetadata: false,
  });
});

test('checklist capture accepts images and keeps the image across editing', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);

  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const composer = page.getByRole('form', { name: 'New checklist' });
  await expect(composer).toBeVisible();
  await composer.getByLabel('Checklist title').fill('Packing photos');
  await composer.getByRole('button', { name: 'Add attachment' }).click();
  await composer.getByLabel('Choose images').setInputFiles(imageFile('packing.png'));
  await expect(composer.getByRole('button', { name: 'Open image: packing.png' })).toBeVisible();
  await composer.getByRole('button', { name: 'Close' }).click();

  const card = page.locator('[data-note-card]').filter({ hasText: 'Packing photos' });
  await expect(card).toBeVisible();
  await expect(card.locator('.note-card-image-wrap img')).toBeVisible();
  await card.getByRole('button', { name: 'Open note: Packing photos' }).click();

  const editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await expect(editor.getByRole('button', { name: 'Open image: packing.png' })).toBeVisible();
  await editor.getByRole('button', { name: 'Close' }).click();

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = (await db.notesDatabase.notes.toArray()).find(
      (candidate) => candidate.title === 'Packing photos',
    );
    return {
      type: note?.type ?? null,
      attachments: note
        ? await db.notesDatabase.attachments.where('noteId').equals(note.id).count()
        : 0,
    };
  });
  expect(stored).toEqual({ type: 'checklist', attachments: 1 });
});

test('imported non-image attachments are visible and downloadable instead of disappearing', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = await new db.NotesRepository(db.notesDatabase).create({
      title: 'Imported file',
      content: 'Keep attachment compatibility',
    });
    await db.notesDatabase.attachments.add(
      db.attachmentRecordSchema.parse({
        id: crypto.randomUUID(),
        noteId: note.id,
        name: 'details.txt',
        mimeType: 'text/plain',
        size: 12,
        checksum: 'seed-checksum',
        data: new Blob(['hello import'], { type: 'text/plain' }),
        createdAt: Date.now(),
      }),
    );
  });
  await page.reload();

  const card = page.locator('[data-note-card]').filter({ hasText: 'Imported file' });
  await expect(card.getByText('1 attachment')).toBeVisible();
  await card.getByRole('button', { name: 'Open note: Imported file' }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByText('details.txt')).toBeVisible();
  await expect(editor.getByText(/text\/plain/u)).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Download attachment: details.txt' }),
  ).toBeVisible();
});

test('image attachment controls remain usable at the minimum supported viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');
  await waitForNotes(page);

  await page.getByLabel('Choose images for new note').setInputFiles(imageFile('mobile.png'));
  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer.getByRole('button', { name: 'Open image: mobile.png' })).toBeVisible();
  await expect(composer.getByRole('button', { name: 'Take a photo' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
