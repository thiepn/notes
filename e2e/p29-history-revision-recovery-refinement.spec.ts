import { expect, test, type Locator, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function seedTextHistory(page: Page) {
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const revisions = new db.RevisionsRepository(db.notesDatabase);
    let note = await notes.create({
      title: 'P29 history note',
      content: 'Original recoverable body',
      color: 'blue',
    });
    await revisions.checkpoint(note.id, 'edit');
    note = await notes.update(
      note.id,
      { content: 'Current recoverable body', color: 'green' },
      note.revision,
    );
    await revisions.checkpoint(note.id, 'close');
    return { noteId: note.id };
  });
}

async function openHistory(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open note: P29 history note' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'More', exact: true }).click();
  await editor.getByRole('menuitem', { name: 'History', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await expect(history).toBeVisible();
  await expect(history.locator('.revision-history-item')).toHaveCount(2);
  return history;
}

async function prepareHistory(page: Page) {
  await page.goto('./');
  await waitForNotes(page);
  const seeded = await seedTextHistory(page);
  await page.reload();
  await waitForNotes(page);
  return { ...seeded, history: await openHistory(page) };
}

test('current history state is explicit and keyboard revision navigation is deterministic', async ({
  page,
}) => {
  const { history } = await prepareHistory(page);
  const versions = history.locator('.revision-history-item');
  const current = versions.first();
  const historical = versions.last();

  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute('data-current', 'true');
  await expect(current).toContainText('Current');
  await expect(history.getByText('Current recoverable version')).toBeVisible();
  await expect(
    history.getByRole('button', { name: 'Current version', exact: true }),
  ).toBeDisabled();

  await page.keyboard.press('End');
  await expect(historical).toBeFocused();
  await expect(history.getByText('Original recoverable body', { exact: true })).toBeVisible();
  await expect(history.getByText('Historical recoverable version')).toBeVisible();
  await expect(history.getByRole('button', { name: 'Restore this version' })).toBeEnabled();

  await page.keyboard.press('Home');
  await expect(current).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(historical).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(current).toBeFocused();
});

test('restore locks history while busy, keeps failure retryable, and focuses Undo after success', async ({
  page,
}) => {
  const { history, noteId } = await prepareHistory(page);

  await page.evaluate(async () => {
    const module = await import('/notes/src/db/repositories/revisionsRepository.ts');
    const prototype = module.RevisionsRepository.prototype;
    const original = prototype.restore;
    let firstAttempt = true;
    let release: (() => void) | null = null;

    prototype.restore = async function (...args: Parameters<typeof original>) {
      if (firstAttempt) {
        firstAttempt = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('Synthetic P29 restore failure');
      }
      return original.apply(this, args);
    };

    (
      window as typeof window & {
        __p29ReleaseRestore?: () => void;
      }
    ).__p29ReleaseRestore = () => {
      release?.();
      release = null;
    };
  });

  const versions = history.locator('.revision-history-item');
  const historical = versions.last();
  await historical.click();
  await history.getByRole('button', { name: 'Restore this version' }).click();

  await expect(history).toHaveAttribute('aria-busy', 'true');
  await expect(history.getByRole('button', { name: 'Close version history' })).toBeDisabled();
  await expect(history.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
  await expect(versions.first()).toBeDisabled();
  await expect(versions.last()).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(history).toBeVisible();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p29ReleaseRestore?: () => void;
      }
    ).__p29ReleaseRestore?.();
  });

  const failure = history.getByRole('alert');
  await expect(failure).toContainText('Restore failed');
  await expect(failure).toContainText('Synthetic P29 restore failure');
  await expect(failure).toBeFocused();
  await expect(history.getByText('Original recoverable body', { exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Restore this version' })).toBeEnabled();

  await history.getByRole('button', { name: 'Restore this version' }).click();
  await expect(history.getByRole('status')).toContainText('restored');
  const undo = history.getByRole('button', { name: 'Undo restore' });
  await expect(undo).toBeFocused();
  await expect(
    history.getByRole('button', { name: 'Current version', exact: true }),
  ).toBeDisabled();

  const restored = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const note = await new db.NotesRepository(db.notesDatabase).require(id);
    return { content: note.content, color: note.color };
  }, noteId);
  expect(restored).toEqual({ content: 'Original recoverable body', color: 'blue' });

  await undo.click();
  const undoneStatus = history.getByRole('status');
  await expect(undoneStatus).toContainText('Restore undone');
  await expect(undoneStatus).toBeFocused();

  const undone = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const note = await new db.NotesRepository(db.notesDatabase).require(id);
    return { content: note.content, color: note.color };
  }, noteId);
  expect(undone).toEqual({ content: 'Current recoverable body', color: 'green' });
});

test('a post-restore history refresh failure never misreports the committed recovery as failed', async ({
  page,
}) => {
  const { history, noteId } = await prepareHistory(page);

  await page.evaluate(async () => {
    const module = await import('/notes/src/db/repositories/revisionsRepository.ts');
    const prototype = module.RevisionsRepository.prototype;
    const original = prototype.list;
    let failNextList = true;
    prototype.list = async function (...args: Parameters<typeof original>) {
      if (failNextList) {
        failNextList = false;
        throw new Error('Synthetic P29 history refresh failure');
      }
      return original.apply(this, args);
    };
  });

  await history.locator('.revision-history-item').last().click();
  await history.getByRole('button', { name: 'Restore this version' }).click();

  await expect(history.getByRole('status')).toContainText('restored');
  const warning = history.getByRole('alert');
  await expect(warning).toContainText('version was restored');
  await expect(warning).toContainText('could not refresh');
  await expect(warning).toContainText('Synthetic P29 history refresh failure');
  await expect(warning).toBeFocused();
  await expect(
    history.getByRole('button', { name: 'Current version', exact: true }),
  ).toBeDisabled();
  await expect(history.getByRole('button', { name: 'Undo restore' })).toBeVisible();

  const stored = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return (await new db.NotesRepository(db.notesDatabase).require(id)).content;
  }, noteId);
  expect(stored).toBe('Original recoverable body');
});

test('copying a version locks the recovery surface and focuses the non-destructive completion result', async ({
  page,
}) => {
  const { history, noteId } = await prepareHistory(page);

  await page.evaluate(async () => {
    const module = await import('/notes/src/db/repositories/revisionsRepository.ts');
    const prototype = module.RevisionsRepository.prototype;
    const original = prototype.copyAsNew;
    let release: (() => void) | null = null;

    prototype.copyAsNew = async function (...args: Parameters<typeof original>) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original.apply(this, args);
    };

    (
      window as typeof window & {
        __p29ReleaseCopy?: () => void;
      }
    ).__p29ReleaseCopy = () => {
      release?.();
      release = null;
    };
  });

  await history.locator('.revision-history-item').last().click();
  await history.getByRole('button', { name: 'Copy as new note' }).click();
  await expect(history).toHaveAttribute('aria-busy', 'true');
  await expect(history.getByRole('button', { name: 'Copying…' })).toBeDisabled();
  await expect(history.getByRole('button', { name: 'Close version history' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(history).toBeVisible();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p29ReleaseCopy?: () => void;
      }
    ).__p29ReleaseCopy?.();
  });

  const status = history.getByRole('status');
  await expect(status).toContainText('copied to a new active note');
  await expect(status).toBeFocused();

  const stored = await page.evaluate(async (originalId) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await new db.NotesRepository(db.notesDatabase).listActive();
    const original = notes.find((note) => note.id === originalId);
    const copy = notes.find((note) => note.id !== originalId && note.title === 'P29 history note');
    return {
      originalContent: original?.content ?? null,
      copyContent: copy?.content ?? null,
    };
  }, noteId);
  expect(stored).toEqual({
    originalContent: 'Current recoverable body',
    copyContent: 'Original recoverable body',
  });
});
