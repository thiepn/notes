import { expect, test, type Page } from '@playwright/test';

async function seedActiveNotes(page: Page, titles: string[]) {
  await page.goto('./');
  return page.evaluate(async (noteTitles) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const notes = [];
    for (const title of noteTitles) {
      notes.push(await repository.create({ title, content: `Content for ${title}` }));
    }
    return notes.map((note) => note.id);
  }, titles);
}

async function seedArchivedNotes(page: Page, titles: string[]) {
  await page.goto('./');
  return page.evaluate(async (noteTitles) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const ids = [];
    for (const title of noteTitles) {
      const note = await repository.create({ title, content: `Archived ${title}` });
      const archived = await repository.archive(note.id, note.revision);
      ids.push(archived.id);
    }
    return ids;
  }, titles);
}

async function selectAllVisible(page: Page) {
  const firstCard = page.locator('[data-note-card]').first();
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Select note:/ }).click();
  const selectAll = page
    .getByRole('toolbar', { name: 'Selected notes actions' })
    .getByRole('button', {
      name: /^Select all /,
    });
  if (await selectAll.isVisible()) await selectAll.click();
}

test('desktop modifier selection supports toggle, range, ordinary selection clicks, and Escape', async ({
  page,
}) => {
  await seedActiveNotes(page, ['One', 'Two', 'Three', 'Four', 'Five']);
  await page.reload();

  const cards = page.locator('[data-note-card]');
  const first = cards.nth(0);
  const second = cards.nth(1);
  const third = cards.nth(2);

  await first.getByRole('button', { name: /^Open note:/ }).click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toContainText(
    '1 selected',
  );
  await expect(first).toHaveAttribute('data-selected', 'true');

  await third.getByRole('button', { name: /^Open note:/ }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toContainText(
    '3 selected',
  );

  await second.getByRole('button', { name: /^Open note:/ }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toContainText(
    '2 selected',
  );
  await expect(second).toHaveAttribute('data-selected', 'false');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toHaveCount(0);
});

test('touch long press enters selection without opening the note editor', async ({ page }) => {
  await seedActiveNotes(page, ['Touch select']);
  await page.reload();

  const card = page.locator('[data-note-card]').first();
  const surface = card.getByRole('button', { name: 'Open note: Touch select' });
  await surface.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, isPrimary: true });
  await page.waitForTimeout(520);
  await surface.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, isPrimary: true });

  await expect(card).toHaveAttribute('data-selected', 'true');
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toContainText(
    '1 selected',
  );
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toHaveCount(0);
});

test('bulk pin, color, labels, archive, and Undo preserve the prior state', async ({ page }) => {
  await seedActiveNotes(page, ['Alpha', 'Beta', 'Gamma']);
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    await labels.create('Work');
  });
  await page.reload();

  await selectAllVisible(page);
  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await expect(toolbar).toContainText('3 selected');

  await toolbar.getByRole('button', { name: 'Pin selected notes' }).click();
  await expect(page.locator('[data-note-card][data-pinned="true"]')).toHaveCount(3);

  await toolbar.getByRole('button', { name: 'Change color for selected notes' }).click();
  await page
    .getByRole('dialog', { name: 'Bulk note color' })
    .getByRole('button', { name: 'Set Yellow color on selected notes' })
    .click();
  await expect(page.locator('[data-note-card][data-color="yellow"]')).toHaveCount(3);

  await toolbar.getByRole('button', { name: 'Change labels for selected notes' }).click();
  await page
    .getByRole('dialog', { name: 'Bulk note labels' })
    .getByRole('button', { name: 'Add label Work to selected notes' })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toHaveCount(0);

  const labelCounts = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = await dbModule.notesDatabase.notes.toArray();
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const work = (await labels.list()).find((label) => label.name === 'Work');
    if (!work) return [];
    return Promise.all(
      notes.map(async (note) => (await labels.labelIdsForNote(note.id)).includes(work.id)),
    );
  });
  expect(labelCounts).toEqual([true, true, true]);

  await selectAllVisible(page);
  await page
    .getByRole('toolbar', { name: 'Selected notes actions' })
    .getByRole('button', { name: 'Archive selected notes' })
    .click();
  await expect(page.locator('[data-note-card]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  await expect(page.locator('[data-note-card][data-pinned="true"]')).toHaveCount(3);
  await expect(page.locator('[data-note-card][data-color="yellow"]')).toHaveCount(3);
});

test('Archive and Trash expose mode-valid bulk lifecycle actions and confirmed permanent delete', async ({
  page,
}) => {
  await seedArchivedNotes(page, ['Archived A', 'Archived B', 'Archived C']);
  await page.reload();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);

  await selectAllVisible(page);
  const archiveToolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await expect(archiveToolbar.getByRole('button', { name: 'Pin selected notes' })).toHaveCount(0);
  await archiveToolbar.getByRole('button', { name: 'Move selected notes to trash' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  await selectAllVisible(page);
  await page
    .getByRole('toolbar', { name: 'Selected notes actions' })
    .getByRole('button', { name: 'Restore selected notes' })
    .click();
  await expect(page.locator('[data-note-card]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  await selectAllVisible(page);
  await page
    .getByRole('toolbar', { name: 'Selected notes actions' })
    .getByRole('button', { name: 'Delete selected notes permanently' })
    .click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Delete 3 notes permanently?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(0);

  const remaining = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    return dbModule.notesDatabase.notes.count();
  });
  expect(remaining).toBe(0);
});

test('select all and a bulk mutation span 500 notes with progressive card mounting', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const base = Date.now();
    await dbModule.notesDatabase.notes.bulkAdd(
      Array.from({ length: 500 }, (_, index) => ({
        id: crypto.randomUUID(),
        type: 'text' as const,
        title: `Stress ${index + 1}`,
        content: `Bulk selection stress note ${index + 1}`,
        color: 'default' as const,
        createdAt: base + index,
        updatedAt: base + index,
        pinnedAt: null,
        archivedAt: null,
        trashedAt: null,
        position: index,
        revision: 1,
      })),
    );
  });
  await page.reload();

  const cards = page.locator('[data-note-card]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(500);
  await expect(page.locator('.note-grid').first()).toHaveAttribute('data-total-count', '500');

  await selectAllVisible(page);
  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await expect(toolbar).toContainText('500 selected');
  await toolbar.getByRole('button', { name: 'Change color for selected notes' }).click();
  await page
    .getByRole('dialog', { name: 'Bulk note color' })
    .getByRole('button', { name: 'Set Gray color on selected notes' })
    .click();

  await expect(cards.first()).toHaveAttribute('data-color', 'gray');
  const grayCount = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    return (await dbModule.notesDatabase.notes.toArray()).filter((note) => note.color === 'gray')
      .length;
  });
  expect(grayCount).toBe(500);

  await toolbar.getByRole('button', { name: 'Exit selection' }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toHaveCount(0);
});
