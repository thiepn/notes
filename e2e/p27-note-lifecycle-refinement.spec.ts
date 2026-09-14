import { expect, test, type Page } from '@playwright/test';

async function seedActiveNotes(page: Page, titles: string[]) {
  await page.goto('./');
  return page.evaluate(async (noteTitles) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const ids: string[] = [];
    for (const title of noteTitles) {
      const note = await repository.create({ title, content: `Lifecycle content for ${title}` });
      ids.push(note.id);
    }
    return ids;
  }, titles);
}

async function seedTrashedNotes(page: Page, titles: string[]) {
  await page.goto('./');
  return page.evaluate(async (noteTitles) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const ids: string[] = [];
    for (const title of noteTitles) {
      const note = await repository.create({ title, content: `Lifecycle content for ${title}` });
      const trashed = await repository.trash(note.id, note.revision);
      ids.push(trashed.id);
    }
    return ids;
  }, titles);
}

async function openTrash(page: Page) {
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trash', level: 1 })).toBeVisible();
}

test('single lifecycle removal moves focus to the next remaining note', async ({ page }) => {
  await seedActiveNotes(page, ['Lifecycle first', 'Lifecycle middle', 'Lifecycle last']);
  await page.reload();

  const cards = page.locator('[data-note-card]');
  await expect(cards).toHaveCount(3);

  const middle = cards.nth(1);
  const next = cards.nth(2);
  const middleId = await middle.getAttribute('data-note-id');
  const nextId = await next.getAttribute('data-note-id');
  expect(middleId).not.toBeNull();
  expect(nextId).not.toBeNull();

  await middle.hover();
  const archive = middle.getByRole('button', { name: /^Archive note:/ });
  await archive.focus();
  await archive.click();

  await expect(page.locator(`[data-note-id="${middleId}"]`)).toHaveCount(0);
  await expect(
    page.locator(`[data-note-id="${nextId}"]`).getByRole('button', { name: /^Open note:/ }),
  ).toBeFocused();
});

test('trash restore keeps focus on the remaining note and then the empty state', async ({
  page,
}) => {
  await seedTrashedNotes(page, ['Trash focus one', 'Trash focus two']);
  await page.reload();
  await openTrash(page);

  let cards = page.locator('[data-note-card]');
  await expect(cards).toHaveCount(2);
  const first = cards.nth(0);
  const second = cards.nth(1);
  const firstId = await first.getAttribute('data-note-id');
  const secondId = await second.getAttribute('data-note-id');
  expect(firstId).not.toBeNull();
  expect(secondId).not.toBeNull();

  const firstRestore = first.getByRole('button', { name: /^Restore note:/ });
  await firstRestore.focus();
  await firstRestore.click();

  await expect(page.locator(`[data-note-id="${firstId}"]`)).toHaveCount(0);
  const remainingRestore = page
    .locator(`[data-note-id="${secondId}"]`)
    .getByRole('button', { name: /^Restore note:/ });
  await expect(remainingRestore).toBeFocused();

  await remainingRestore.click();
  cards = page.locator('[data-note-card]');
  await expect(cards).toHaveCount(0);
  const emptyState = page.locator('.empty-state');
  await expect(emptyState.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
  await expect(emptyState).toBeFocused();
});

test('permanent delete stays busy, survives failure, and retries without losing focus', async ({
  page,
}) => {
  await seedTrashedNotes(page, ['Retry delete', 'Keep after delete']);
  await page.reload();
  await openTrash(page);

  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const prototype = dbModule.NotesRepository.prototype;
    const original = prototype.deletePermanently;
    let firstAttempt = true;
    let release: (() => void) | null = null;

    prototype.deletePermanently = async function (noteId: string) {
      if (firstAttempt) {
        firstAttempt = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('Synthetic P27 delete failure');
      }
      return original.call(this, noteId);
    };

    (
      window as typeof window & {
        __p27ReleaseDelete?: () => void;
      }
    ).__p27ReleaseDelete = () => {
      release?.();
      release = null;
    };
  });

  const cards = page.locator('[data-note-card]');
  await expect(cards).toHaveCount(2);
  const deletingCard = cards.nth(0);
  const remainingCard = cards.nth(1);
  const deletingId = await deletingCard.getAttribute('data-note-id');
  const remainingId = await remainingCard.getAttribute('data-note-id');
  expect(deletingId).not.toBeNull();
  expect(remainingId).not.toBeNull();

  await deletingCard.getByRole('button', { name: /^Delete note permanently:/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete note permanently?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p27ReleaseDelete?: () => void;
      }
    ).__p27ReleaseDelete?.();
  });

  await expect(dialog.getByRole('alert')).toHaveText('Note could not be deleted. Try again.');
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator(`[data-note-id="${deletingId}"]`)).toBeVisible();

  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-note-id="${deletingId}"]`)).toHaveCount(0);
  await expect(
    page.locator(`[data-note-id="${remainingId}"]`).getByRole('button', { name: /^Restore note:/ }),
  ).toBeFocused();
});

test('bulk delete cancellation restores its trigger and empty trash focuses the empty state', async ({
  page,
}) => {
  await seedTrashedNotes(page, ['Bulk one', 'Bulk two', 'Bulk three', 'Bulk four']);
  await page.reload();
  await openTrash(page);

  const firstCard = page.locator('[data-note-card]').first();
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Select note:/ }).click();

  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  const deleteSelected = toolbar.getByRole('button', {
    name: 'Delete selected notes permanently',
  });
  await deleteSelected.click();

  let dialog = page.getByRole('alertdialog', { name: 'Delete note permanently?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(deleteSelected).toBeFocused();

  await deleteSelected.click();
  dialog = page.getByRole('alertdialog', { name: 'Delete note permanently?' });
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  await expect(
    page
      .locator('[data-note-card]')
      .first()
      .getByRole('button', { name: /^Restore note:/ }),
  ).toBeFocused();

  const emptyTrash = page.getByRole('button', { name: 'Empty trash' });
  await emptyTrash.click();
  dialog = page.getByRole('alertdialog', { name: 'Empty trash?' });
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();

  await expect(page.locator('[data-note-card]')).toHaveCount(0);
  const emptyState = page.locator('.empty-state');
  await expect(emptyState.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
  await expect(emptyState).toBeFocused();
});
