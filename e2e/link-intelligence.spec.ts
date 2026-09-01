import { expect, test, type Page } from '@playwright/test';

async function seedLinkLibrary(page: Page) {
  await page.goto('./');
  const ids = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const target = await notes.create({
      title: 'Project Atlas',
      content: 'Canonical project note.',
    });
    const explicit = await notes.create({
      title: 'Meeting Notes',
      content: 'Review [[Project Atlas]] before Friday.',
    });
    const plain = await notes.create({
      title: 'Research Notes',
      content: 'Project Atlas needs another source. Project Atlas also needs a budget.',
    });
    const missing = await notes.create({
      title: 'Broken Reference',
      content: 'See [[Missing Target]].',
    });
    return {
      targetId: target.id,
      explicitId: explicit.id,
      plainId: plain.id,
      missingId: missing.id,
    };
  });
  await page.reload();
  return ids;
}

async function openCard(page: Page, noteId: string) {
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card).toBeVisible();
  await card.locator('.note-card-open').click();
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
}

test('connections derive backlinks and convert unlinked mentions without stored edge rows', async ({
  page,
}) => {
  const ids = await seedLinkLibrary(page);
  await openCard(page, ids.targetId);

  const connections = page.getByRole('region', { name: 'Connections' });
  await expect(connections).toContainText('1 linked note');
  await expect(connections).toContainText('1 unlinked mention');
  await expect(connections.getByRole('button', { name: /Meeting Notes/ })).toBeVisible();
  await expect(connections.getByRole('button', { name: /Research Notes/ })).toBeVisible();

  await connections.getByRole('button', { name: 'Link 2 mentions' }).click();
  await expect(
    connections.getByText('No links or unlinked mentions found for this note yet'),
  ).toHaveCount(0);
  await expect(connections).toContainText('2 linked notes');
  await expect(connections).toContainText('0 unlinked mentions');

  const stored = await page.evaluate(async (sourceId) => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.get(sourceId))?.content ?? null;
  }, ids.plainId);
  expect(stored).toBe(
    '[[Project Atlas]] needs another source. [[Project Atlas]] also needs a budget.',
  );
});

test('resolved WikiLinks navigate directly while missing targets remain non-interactive', async ({
  page,
}) => {
  const ids = await seedLinkLibrary(page);
  await openCard(page, ids.explicitId);

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Preview formatted text' }).click();
  const wikiLink = editor.getByRole('button', { name: 'Open note: Project Atlas' });
  await expect(wikiLink).toBeVisible();
  await wikiLink.click();

  const targetEditor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(targetEditor.getByLabel('Edit title')).toHaveValue('Project Atlas');

  await targetEditor.getByRole('button', { name: 'Close' }).click();
  await openCard(page, ids.missingId);
  const missingEditor = page.getByRole('dialog', { name: 'Edit note' });
  await missingEditor.getByRole('button', { name: 'Preview formatted text' }).click();
  await expect(missingEditor.locator('.rich-text-wiki-link[data-status="missing"]')).toHaveText(
    'Missing Target',
  );
  await expect(
    missingEditor.getByRole('button', { name: 'Open note: Missing Target' }),
  ).toHaveCount(0);
});

test('duplicate titles stay ambiguous and internal links render/search without raw brackets', async ({
  page,
}) => {
  await page.goto('./');
  const ids = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: 'Atlas', content: 'First target.' });
    await notes.create({ title: 'ATLAS', content: 'Second target.' });
    const source = await notes.create({ title: 'Source', content: 'See [[Atlas]] now.' });
    return { sourceId: source.id };
  });
  await page.reload();

  const card = page.locator(`[data-note-id="${ids.sourceId}"]`);
  await expect(card).toContainText('Atlas');
  await expect(card).not.toContainText('[[Atlas]]');
  await card.locator('.note-card-open').click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  const connections = page.getByRole('region', { name: 'Connections' });
  await expect(connections).toContainText('Ambiguous target');
  await editor.getByRole('button', { name: 'Preview formatted text' }).click();
  await expect(editor.locator('.rich-text-wiki-link[data-status="ambiguous"]')).toHaveText('Atlas');

  await editor.getByRole('button', { name: 'Close' }).click();
  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('has:link');
  await expect(page.locator(`[data-note-id="${ids.sourceId}"]`)).toBeVisible();
});
