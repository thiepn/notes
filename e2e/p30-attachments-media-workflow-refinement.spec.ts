import { expect, test, type Locator, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGO8E+DGwMDAwMDAxAADABrWAXZuhrHqAAAAAElFTkSuQmCC',
  'base64',
);

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function seedAttachmentNote(page: Page) {
  return page.evaluate(async (png) => {
    const db = await import('/notes/src/db/index.ts');
    const note = await new db.NotesRepository(db.notesDatabase).create({
      title: 'P30 attachment note',
      content: 'Attachment interaction refinement.',
    });
    const now = Date.now();
    await db.notesDatabase.attachments.bulkAdd([
      db.attachmentRecordSchema.parse({
        id: crypto.randomUUID(),
        noteId: note.id,
        name: 'first.png',
        mimeType: 'image/png',
        size: png.length,
        checksum: 'p30-first-image',
        data: new Blob([new Uint8Array(png)], { type: 'image/png' }),
        createdAt: now,
      }),
      db.attachmentRecordSchema.parse({
        id: crypto.randomUUID(),
        noteId: note.id,
        name: 'second.png',
        mimeType: 'image/png',
        size: png.length,
        checksum: 'p30-second-image',
        data: new Blob([new Uint8Array(png)], { type: 'image/png' }),
        createdAt: now + 1,
      }),
    ]);
    return { noteId: note.id };
  }, Array.from(PNG));
}

async function openAttachmentEditor(page: Page): Promise<{
  editor: Locator;
  panel: Locator;
  noteId: string;
}> {
  await page.goto('./');
  await waitForNotes(page);
  const { noteId } = await seedAttachmentNote(page);
  await page.reload();
  await waitForNotes(page);
  await page.getByRole('button', { name: 'Open note: P30 attachment note' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  const panel = editor.getByRole('region', { name: 'Attachments' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open image: first.png' })).toBeVisible();
  return { editor, panel, noteId };
}

test('authoritative attachment loading gates mutation controls until the list resolves', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const { noteId } = await seedAttachmentNote(page);
  await page.reload();
  await waitForNotes(page);

  await page.evaluate(async (targetNoteId) => {
    const module = await import('/notes/src/db/repositories/attachmentsRepository.ts');
    const prototype = module.AttachmentsRepository.prototype;
    const original = prototype.list;
    let released = false;
    let releaseGate: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    prototype.list = async function (...args: Parameters<typeof original>) {
      if (args[0] === targetNoteId && !released) {
        (
          window as typeof window & {
            __p30AttachmentLoadBlocked?: boolean;
          }
        ).__p30AttachmentLoadBlocked = true;
        await gate;
      }
      return original.apply(this, args);
    };
    (
      window as typeof window & {
        __p30ReleaseAttachmentLoad?: () => void;
      }
    ).__p30ReleaseAttachmentLoad = () => {
      released = true;
      releaseGate?.();
      releaseGate = null;
    };
  }, noteId);

  await page.getByRole('button', { name: 'Open note: P30 attachment note' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  const panel = editor.getByRole('region', { name: 'Attachments' });
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __p30AttachmentLoadBlocked?: boolean;
        }
      ).__p30AttachmentLoadBlocked === true,
  );

  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByText('Loading saved media…')).toBeVisible();
  await expect(panel.getByLabel('Choose images')).toBeDisabled();
  await expect(panel.getByLabel('Take photo')).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Add image' })).toBeDisabled();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p30ReleaseAttachmentLoad?: () => void;
      }
    ).__p30ReleaseAttachmentLoad?.();
  });

  await expect(panel).not.toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('button', { name: 'Open image: first.png' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Add image' })).toBeEnabled();
});

test('remove confirmation receives focus and Escape cancels only that intent', async ({ page }) => {
  const { editor, panel } = await openAttachmentEditor(page);
  const remove = panel.getByRole('button', { name: 'Remove image: first.png' });
  await remove.click();

  const confirm = panel.getByRole('group', { name: 'Remove first.png?' });
  const yes = confirm.getByRole('button', { name: 'Yes' });
  await expect(confirm).toBeVisible();
  await expect(yes).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Add image' })).toBeDisabled();

  await page.keyboard.press('Escape');

  await expect(confirm).not.toBeVisible();
  await expect(editor).toBeVisible();
  await expect(remove).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Add image' })).toBeEnabled();
});

test('failed removal preserves confirmation for retry and focuses the truthful error', async ({
  page,
}) => {
  const { panel, noteId } = await openAttachmentEditor(page);

  await page.evaluate(async () => {
    const module = await import('/notes/src/db/repositories/attachmentsRepository.ts');
    const prototype = module.AttachmentsRepository.prototype;
    const original = prototype.remove;
    let firstAttempt = true;
    let release: (() => void) | null = null;
    prototype.remove = async function (...args: Parameters<typeof original>) {
      if (firstAttempt) {
        firstAttempt = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('Synthetic P30 remove failure');
      }
      return original.apply(this, args);
    };
    (
      window as typeof window & {
        __p30ReleaseRemove?: () => void;
      }
    ).__p30ReleaseRemove = () => {
      release?.();
      release = null;
    };
  });

  await panel.getByRole('button', { name: 'Remove image: first.png' }).click();
  const confirm = panel.getByRole('group', { name: 'Remove first.png?' });
  await confirm.getByRole('button', { name: 'Yes' }).click();

  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(confirm.getByRole('button', { name: 'Removing…' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Add image' })).toBeDisabled();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p30ReleaseRemove?: () => void;
      }
    ).__p30ReleaseRemove?.();
  });

  const error = panel.getByRole('alert');
  await expect(error).toContainText('Synthetic P30 remove failure');
  await expect(error).toBeFocused();
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Yes' })).toBeEnabled();

  await confirm.getByRole('button', { name: 'Yes' }).click();
  const status = panel.getByRole('status');
  await expect(status).toContainText('Attachment removed.');
  await expect(status).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Open image: first.png' })).not.toBeVisible();

  const remaining = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return db.notesDatabase.attachments.where('noteId').equals(id).count();
  }, noteId);
  expect(remaining).toBe(1);
});

test('nested image viewer has deterministic close focus and returns to the viewed image', async ({
  page,
}) => {
  const { editor, panel } = await openAttachmentEditor(page);
  await panel.getByRole('button', { name: 'Open image: first.png' }).click();

  let lightbox = page.getByRole('dialog', { name: 'Image viewer: first.png' });
  const close = lightbox.getByRole('button', { name: 'Close image viewer' });
  await expect(close).toBeFocused();
  await expect(lightbox.getByText('1 / 2', { exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  lightbox = page.getByRole('dialog', { name: 'Image viewer: second.png' });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.getByText('2 / 2', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(lightbox).not.toBeVisible();
  await expect(editor).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open image: second.png' })).toBeFocused();
});
