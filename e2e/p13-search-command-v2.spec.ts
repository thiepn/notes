import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedP13Library(page: Page) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  const ids = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);

    const bodyTarget = await notes.create({
      title: 'Hidden body target',
      content: 'The spectral banana theorem belongs only in this note body.',
    });
    const labeled = await notes.create({
      title: 'Alpha planning',
      content: 'Planning details for the labeled note.',
    });
    const label = await labels.create('Project Alpha');
    await labels.assign(labeled.id, label.id);
    return { bodyTargetId: bodyTarget.id, labeledId: labeled.id };
  });
  await page.reload();
  await waitForNotesWorkspace(page);
  return ids;
}

test('command palette keeps strong commands first and falls through to full-content search', async ({
  page,
}) => {
  const ids = await seedP13Library(page);

  await page.keyboard.press('Control+K');
  let palette = page.getByRole('dialog', { name: 'Command palette' });
  let input = palette.getByRole('combobox', { name: 'Search commands' });
  await input.fill('archive');
  await expect(palette.getByRole('option').first()).toContainText('Open Archive');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();

  await page.keyboard.press('Control+K');
  palette = page.getByRole('dialog', { name: 'Command palette' });
  input = palette.getByRole('combobox', { name: 'Search commands' });
  await input.fill('spectral banana theorem');
  await expect(palette.getByRole('option', { name: /Search notes for/u })).toBeVisible();
  await input.press('Enter');

  const searchInput = page.getByRole('searchbox', { name: 'Search notes' });
  await expect(searchInput).toHaveValue('spectral banana theorem');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.bodyTargetId}"]`)).toBeVisible();
});

test('command discovery tolerates a small typo without changing exact-command behavior', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const input = palette.getByRole('combobox', { name: 'Search commands' });
  await input.fill('archvie');
  await expect(palette.getByRole('option').first()).toContainText('Open Archive');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
});

test('search assist completes operators and quoted label names with keyboard navigation', async ({
  page,
}) => {
  const ids = await seedP13Library(page);
  const search = page.getByRole('searchbox', { name: 'Search notes' });

  await search.focus();
  await search.fill('has:');
  const assist = page.getByRole('dialog', { name: 'Search history' });
  await expect(
    assist.getByRole('button', { name: 'Use search suggestion: Notes with reminders' }),
  ).toBeVisible();
  await search.press('ArrowDown');
  await expect(
    assist.getByRole('button', { name: 'Use search suggestion: Notes with reminders' }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    assist.getByRole('button', { name: 'Use search suggestion: Notes with images' }),
  ).toBeFocused();

  await search.focus();
  await search.fill('label:pro');
  const labelSuggestion = assist.getByRole('button', {
    name: 'Use search suggestion: Label: Project Alpha',
  });
  await expect(labelSuggestion).toBeVisible();
  await labelSuggestion.click();
  await expect(search).toHaveValue('label:"Project Alpha"');
  await expect(page.locator(`[data-note-id="${ids.labeledId}"]`)).toBeVisible();
});

test('saved searches remain discoverable while typing and mobile assist targets stay touch-safe', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const historyModule = await import('/notes/src/features/search/searchHistory.ts');
    const typesModule = await import('/notes/src/features/search/searchTypes.ts');
    const history = new historyModule.SearchHistoryRepository(dbModule.notesDatabase);
    await history.save({
      query: 'mission planning',
      filters: { ...typesModule.DEFAULT_SEARCH_FILTERS },
    });
  });
  await page.reload();
  await waitForNotesWorkspace(page);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.focus();
  await search.fill('mission');
  const assist = page.getByRole('dialog', { name: 'Search history' });
  await expect(
    assist.getByRole('button', { name: 'Open saved search: mission planning' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await search.focus();
  await search.fill('is:');
  const quick = assist.getByRole('button', { name: 'Use search suggestion: Pinned notes' });
  await expect(quick).toBeVisible();
  const box = await quick.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
