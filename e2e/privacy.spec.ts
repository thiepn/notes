import { expect, test, type Page } from '@playwright/test';

async function seedPrivateNote(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: 'Private plan', content: 'Secret body details' })).id;
  });
}

async function openPrivacySettings(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Privacy settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('hide note previews masks visible and accessible card details while preserving deliberate editing', async ({
  page,
}) => {
  const noteId = await seedPrivateNote(page);
  await page.reload();

  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card.getByText('Private plan')).toBeVisible();
  await expect(card.getByText('Secret body details')).toBeVisible();

  const privacy = await openPrivacySettings(page);
  await privacy.getByLabel('Hide note previews').check();

  await expect(card).toHaveAttribute('data-preview-hidden', 'true');
  await expect(card.getByText('Preview hidden')).toBeVisible();
  await expect(card.getByText('Private plan')).toHaveCount(0);
  await expect(card.getByText('Secret body details')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Open note: Hidden note' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Private plan|Secret body details/u })).toHaveCount(
    0,
  );

  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();
  await card.getByRole('button', { name: 'Open note: Hidden note' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByDisplayValue('Private plan')).toBeVisible();
  await expect(editor.getByText('Secret body details')).toBeVisible();
  await editor.getByRole('button', { name: 'Close editor' }).click();

  await page.reload();
  const reloadedCard = page.locator(`[data-note-id="${noteId}"]`);
  await expect(reloadedCard.getByText('Preview hidden')).toBeVisible();
  await expect(reloadedCard.getByText('Private plan')).toHaveCount(0);
});

test('privacy lock stores only a derived credential, hides the app, rejects wrong passcodes, and locks on reload', async ({
  page,
}) => {
  await seedPrivateNote(page);
  await page.reload();

  const privacy = await openPrivacySettings(page);
  await privacy.getByLabel('Passcode', { exact: true }).fill('4815');
  await privacy.getByLabel('Confirm passcode').fill('4815');
  await privacy.getByRole('button', { name: 'Enable privacy lock' }).click();
  await expect(privacy.getByText(/Privacy lock enabled/u)).toBeVisible();

  const storedCredential = await page.evaluate(() =>
    localStorage.getItem('notes.privacy.credential.v1'),
  );
  expect(storedCredential).toBeTruthy();
  expect(storedCredential).not.toContain('4815');
  expect(JSON.parse(storedCredential ?? '{}').hash).toMatch(/^[0-9a-f]{64}$/u);

  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Lock now' }).click();

  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  await expect(page.getByText('Private plan')).toHaveCount(0);
  const passcode = page.getByLabel('Passcode');
  await passcode.fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect passcode.');

  await passcode.fill('4815');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toHaveCount(0);
  await expect(page.getByText('Private plan')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  await page.getByLabel('Passcode').fill('4815');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Private plan')).toBeVisible();
});

test('privacy settings clear only disposable recent-search history', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const search = await import('/notes/src/features/search/searchHistory.ts');
    const types = await import('/notes/src/features/search/searchTypes.ts');
    search.rememberRecentSearch({
      query: 'sensitive query',
      filters: { ...types.DEFAULT_SEARCH_FILTERS },
    });

    const db = await import('/notes/src/db/index.ts');
    const repository = new search.SearchHistoryRepository(db.notesDatabase);
    await repository.save({ query: 'saved query', filters: { ...types.DEFAULT_SEARCH_FILTERS } });
  });

  const privacy = await openPrivacySettings(page);
  await privacy.getByRole('button', { name: 'Clear recent searches' }).click();
  await expect(privacy.getByText('Recent search history cleared.')).toBeVisible();

  const state = await page.evaluate(async () => {
    const search = await import('/notes/src/features/search/searchHistory.ts');
    const db = await import('/notes/src/db/index.ts');
    const repository = new search.SearchHistoryRepository(db.notesDatabase);
    return {
      recent: search.readRecentSearches(),
      saved: await repository.listSaved(),
    };
  });

  expect(state.recent).toHaveLength(0);
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]?.query).toBe('saved query');
});
