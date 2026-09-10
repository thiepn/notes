import { expect, test, type Page } from '@playwright/test';

const QUICKSTART_KEY = 'notes.onboarding.quickstart.v1';

async function seedRelatedNotes(page: Page) {
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const now = Date.now();
    const source = {
      id: crypto.randomUUID(),
      type: 'text' as const,
      title: 'Linear algebra exam',
      content: 'Jordan form eigenvalues eigenvectors matrix basis similarity transformation',
      color: 'default' as const,
      createdAt: now,
      updatedAt: now,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      position: 0,
      revision: 1,
    };
    const related = {
      ...source,
      id: crypto.randomUUID(),
      title: 'Jordan form notes',
      content: 'Matrix eigenvalues basis diagonalization and similarity transformation',
      createdAt: now - 1,
      updatedAt: now - 1,
      position: 1,
    };
    await db.notesDatabase.notes.bulkPut([source, related]);
    return { sourceId: source.id };
  });
}

test('PWA capture shortcut opens a text note directly and cleans the launch URL', async ({
  page,
}) => {
  await page.goto('./?capture=text');

  await expect(page.getByLabel('Title')).toBeVisible();
  await expect(page.getByLabel('Note text')).toBeVisible();
  await expect(page).toHaveURL(/\/notes\/$/u);
});

test('search deep link opens search and applies the query', async ({ page }) => {
  await page.goto('./?view=search&q=algebra');

  await expect(page).toHaveTitle('Search — Notes');
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('algebra');
  await expect(page).toHaveURL(/\/notes\/$/u);
});

test('note deep link opens the requested local note and cleans the launch URL', async ({
  page,
}) => {
  await page.goto('./');
  const { sourceId } = await seedRelatedNotes(page);

  await page.goto(`./?note=${sourceId}`);

  await expect(page.getByLabel('Title')).toHaveValue('Linear algebra exam');
  await expect(page.getByLabel('Note text')).toContainText('Jordan form eigenvalues');
  await expect(page).toHaveURL(/\/notes\/$/u);
});

test('empty libraries get a small non-blocking first-run path into capture', async ({ page }) => {
  await page.goto('./');

  const coach = page.getByLabel('Getting started with Notes');
  await expect(coach).toBeVisible();
  await coach.getByRole('button', { name: 'Create a note' }).click();

  await expect(page.getByLabel('Title')).toBeVisible();
  await expect(coach).not.toBeVisible();
});

test('established libraries never regain first-run coaching after becoming empty', async ({
  page,
}) => {
  await page.goto('./');
  await seedRelatedNotes(page);
  await page.reload();

  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), QUICKSTART_KEY))
    .toBe('done');

  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    await db.notesDatabase.notes.clear();
  });
  await page.reload();
  await page.waitForTimeout(1_100);

  await expect(page.getByLabel('Getting started with Notes')).not.toBeVisible();
});

test('editor connections surface deterministic local related notes', async ({ page }) => {
  await page.goto('./');
  const { sourceId } = await seedRelatedNotes(page);
  await page.reload();

  await page.locator(`[data-note-id="${sourceId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'More' }).click();
  await editor.getByRole('menuitem', { name: 'Connections' }).click();

  await expect(editor.getByRole('heading', { name: 'Related notes' })).toBeVisible();
  await expect(editor.getByRole('button', { name: /Jordan form notes/u })).toBeVisible();
  await expect(editor.getByText(/Shared:/u)).toBeVisible();
});
