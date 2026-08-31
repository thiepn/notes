import { expect, test, type Page } from '@playwright/test';

async function createNote(
  page: Page,
  input: {
    title: string;
    content?: string;
    pinned?: boolean;
    archived?: boolean;
    trashed?: boolean;
  },
) {
  await page.goto('./');

  return page.evaluate(async (options) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    let note = await repository.create({
      title: options.title,
      content: options.content ?? 'Lifecycle test note.',
    });

    if (options.pinned) {
      note = await repository.setPinned(note.id, true, note.revision);
    }
    if (options.archived) {
      note = await repository.archive(note.id, note.revision);
    }
    if (options.trashed) {
      note = await repository.trash(note.id, note.revision);
    }

    return note.id;
  }, input);
}

async function storedNote(page: Page, noteId: string) {
  return page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    return repository.get(id);
  }, noteId);
}

async function hoverCard(page: Page, noteId: string) {
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await card.hover();
  return card;
}

test('pinning works and archive undo restores the prior pinned state', async ({ page }) => {
  const noteId = await createNote(page, { title: 'Pinned lifecycle' });
  await page.reload();

  let card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Pin note: Pinned lifecycle' }).click();
  await expect(page.getByRole('heading', { name: 'Pinned', level: 2 })).toBeVisible();

  card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Archive note: Pinned lifecycle' }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();

  card = await hoverCard(page, noteId);
  await expect(card.getByRole('button', { name: 'Unpin note: Pinned lifecycle' })).toBeVisible();

  const note = await storedNote(page, noteId);
  expect(note?.archivedAt).toBeNull();
  expect(note?.pinnedAt).not.toBeNull();
});

test('archive view is functional, persists across reload, and can unarchive notes', async ({
  page,
}) => {
  const noteId = await createNote(page, { title: 'Archived lifecycle', archived: true });
  await page.reload();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();

  const card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Unarchive note: Archived lifecycle' }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();
});

test('undoing trash from Archive restores the note to Archive', async ({ page }) => {
  const noteId = await createNote(page, { title: 'Archive trash undo', archived: true });
  await page.reload();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();

  const card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Move note to trash: Archive trash undo' }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  const note = await storedNote(page, noteId);
  expect(note?.archivedAt).not.toBeNull();
  expect(note?.trashedAt).toBeNull();
});

test('trash restore and permanent deletion use the correct lifecycle gates', async ({ page }) => {
  const noteId = await createNote(page, { title: 'Trash lifecycle', trashed: true });
  await page.reload();

  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  let card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Restore note: Trash lifecycle' }).click();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Move note to trash: Trash lifecycle' }).click();

  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Delete note permanently: Trash lifecycle' }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Delete note permanently?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();

  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);
  expect(await storedNote(page, noteId)).toBeUndefined();
});

test('duplicate creates an active copy and undo removes only the copy', async ({ page }) => {
  const noteId = await createNote(page, { title: 'Duplicate lifecycle' });
  await page.reload();

  const card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Duplicate note: Duplicate lifecycle' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(1);
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();
});
