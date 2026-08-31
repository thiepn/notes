import { expect, test } from '@playwright/test';

async function activeNotes(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    return repository.listActive();
  });
}

test('creates a text note, closes without a save button, and survives reload', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();
  await expect(page.getByLabel('Note text')).toBeFocused();

  await page.getByLabel('Title').fill('Research idea');
  await page
    .getByLabel('Note text')
    .fill('Build the capture path before adding more organization.');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('heading', { name: 'Research idea', level: 2 })).toBeVisible();
  await expect(
    page.getByText('Build the capture path before adding more organization.'),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Research idea', level: 2 })).toBeVisible();
  const notes = await activeNotes(page);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({
    type: 'text',
    title: 'Research idea',
    content: 'Build the capture path before adding more organization.',
  });
});

test('recovers exact text when the page reloads inside the autosave debounce window', async ({
  page,
}) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Note text').fill('This text must survive an immediate reload.');
  await page.reload();

  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();
  await expect(page.getByLabel('Note text')).toHaveValue(
    'This text must survive an immediate reload.',
  );

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('This text must survive an immediate reload.')).toBeVisible();

  const notes = await activeNotes(page);
  expect(notes).toHaveLength(1);
  expect(notes[0]?.content).toBe('This text must survive an immediate reload.');
});

test('does not create an empty note when capture is opened and closed', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Your notes will appear here')).toBeVisible();
  expect(await activeNotes(page)).toHaveLength(0);
});

test('Ctrl+Enter finishes the current note and preserves rapid edits', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Fast capture');
  await page.getByLabel('Note text').pressSequentially('one two three four five', { delay: 4 });
  await page.getByLabel('Note text').press('Control+Enter');

  await expect(page.getByRole('form', { name: 'New note' })).toBeHidden();
  await expect(page.getByText('one two three four five')).toBeVisible();

  const notes = await activeNotes(page);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ title: 'Fast capture', content: 'one two three four five' });
});
