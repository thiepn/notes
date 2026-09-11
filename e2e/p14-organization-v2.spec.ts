import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedP14Library(page: Page) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  const seeded = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const historyModule = await import('/notes/src/features/search/searchHistory.ts');
    const typesModule = await import('/notes/src/features/search/searchTypes.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const history = new historyModule.SearchHistoryRepository(dbModule.notesDatabase);

    const project = await labels.create('Project');
    const archiveTag = await labels.create('Archive Tag');
    await labels.create('French');
    await labels.create('Ideas');
    await labels.create('Reference');
    await labels.create('Unused A');
    await labels.create('Unused B');

    const pinned = await notes.create({ title: 'Pinned project', content: 'Important project note.' });
    await labels.assign(pinned.id, project.id);
    await notes.setPinned(pinned.id, true, pinned.revision);

    const organized = await notes.create({
      title: 'Organized project',
      content: 'This note is already organized.',
    });
    await labels.assign(organized.id, project.id);

    const loose = await notes.create({ title: 'Loose inbox', content: 'Needs organization.' });

    const archivedTagged = await notes.create({
      title: 'Archived reference',
      content: 'Archived but still uses a label.',
    });
    await labels.assign(archivedTagged.id, archiveTag.id);
    await notes.archive(archivedTagged.id, archivedTagged.revision);

    const archivedLoose = await notes.create({
      title: 'Archived loose',
      content: 'Unlabeled archive note.',
    });
    await notes.archive(archivedLoose.id, archivedLoose.revision);

    const saved = await history.save({
      query: 'organized project',
      filters: { ...typesModule.DEFAULT_SEARCH_FILTERS },
    });

    return {
      pinnedId: pinned.id,
      organizedId: organized.id,
      looseId: loose.id,
      archivedTaggedId: archivedTagged.id,
      archivedLooseId: archivedLoose.id,
      projectId: project.id,
      archiveTagId: archiveTag.id,
      savedId: saved[0]?.id ?? null,
    };
  });
  await page.reload();
  await waitForNotesWorkspace(page);
  return seeded;
}

async function selectAllVisible(page: Page) {
  const firstCard = page.locator('[data-note-card]').first();
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Select note:/u }).click();
  const selectAll = page
    .getByRole('toolbar', { name: 'Selected notes actions' })
    .getByRole('button', { name: /^Select all /u });
  if (await selectAll.isVisible()) await selectAll.click();
}

test('Organize shortcuts expose pinned and active unlabeled notes with derived counts', async ({
  page,
}) => {
  const ids = await seedP14Library(page);
  const sidebar = page.getByTestId('app-sidebar');

  const pinned = sidebar.getByRole('button', { name: 'Pinned notes' });
  const unlabeled = sidebar.getByRole('button', { name: 'Unlabeled notes' });
  await expect(pinned.locator('.nav-count')).toHaveText('1');
  await expect(unlabeled.locator('.nav-count')).toHaveText('1');

  await pinned.click();
  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await expect(search).toHaveValue('is:pinned');
  await expect(page.locator(`[data-note-id="${ids.pinnedId}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.organizedId}"]`)).toHaveCount(0);

  await unlabeled.click();
  await expect(search).toHaveValue('is:active is:unlabeled');
  await expect(page.locator(`[data-note-id="${ids.looseId}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.organizedId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-note-id="${ids.archivedLooseId}"]`)).toHaveCount(0);
});

test('saved searches appear as sidebar Smart views and reopen their full snapshot', async ({ page }) => {
  const ids = await seedP14Library(page);
  expect(ids.savedId).not.toBeNull();

  const sidebar = page.getByTestId('app-sidebar');
  const smartView = sidebar.getByRole('button', { name: 'Smart view: organized project' });
  await expect(smartView).toBeVisible();
  await smartView.click();

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await expect(search).toHaveValue('organized project');
  await expect(page.locator(`[data-note-id="${ids.organizedId}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.looseId}"]`)).toHaveCount(0);
});

test('label cleanup sorts by library-wide usage and never marks archive-only labels unused', async ({
  page,
}) => {
  await seedP14Library(page);
  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Edit labels' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit labels' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Sort labels').selectOption('usage');
  const names = dialog.locator('.label-manager-row .label-manager-name');
  await expect(names.nth(0)).toHaveText('Project');
  await expect(names.nth(1)).toHaveText('Archive Tag');
  await expect(
    dialog.locator('.label-manager-row').filter({ hasText: 'Archive Tag' }),
  ).toContainText('1 note');

  const unused = dialog.getByRole('button', { name: /Unused \(5\)/u });
  await expect(unused).toBeEnabled();
  await unused.click();
  await expect(dialog.getByText('Unused A', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Unused B', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Project', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Archive Tag', { exact: true })).toHaveCount(0);
});

test('bulk label assignment can filter a larger label library before applying membership', async ({
  page,
}) => {
  await seedP14Library(page);
  await selectAllVisible(page);

  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await expect(toolbar).toContainText('3 selected');
  await toolbar.getByRole('button', { name: 'Change labels for selected notes' }).click();

  const labelsDialog = page.getByRole('dialog', { name: 'Bulk note labels' });
  const labelSearch = labelsDialog.getByRole('searchbox', {
    name: 'Find labels for selected notes',
  });
  await expect(labelSearch).toBeVisible();
  await labelSearch.fill('French');
  await expect(labelsDialog.getByRole('button', { name: 'Add label French to selected notes' })).toBeVisible();
  await expect(labelsDialog.getByRole('button', { name: /label Project/u })).toHaveCount(0);
  await labelsDialog.getByRole('button', { name: 'Add label French to selected notes' }).click();

  await expect(page.getByRole('toolbar', { name: 'Selected notes actions' })).toHaveCount(0);
  const activeMembership = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const french = (await labels.list()).find((label) => label.name === 'French');
    if (!french) return [];
    const active = await notes.listActive();
    return Promise.all(
      active.map(async (note) => (await labels.labelIdsForNote(note.id)).includes(french.id)),
    );
  });
  expect(activeMembership).toEqual([true, true, true]);
});
