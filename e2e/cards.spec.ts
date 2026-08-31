import { expect, test, type Page } from '@playwright/test';

async function seedNotes(page: Page, options: { includePinned?: boolean; count?: number } = {}) {
  const { includePinned = false, count = 5 } = options;
  await page.goto('./');

  return page.evaluate(
    async ({ shouldPin, noteCount }) => {
      const dbModule = await import('/notes/src/db/index.ts');
      const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
      const created: Array<{ id: string; title: string }> = [];

      for (let index = 0; index < noteCount; index += 1) {
        const note = await repository.create({
          title: `Card ${index + 1}`,
          content:
            index % 2 === 0
              ? `Short body ${index + 1}.`
              : `Long body ${index + 1}.\nThis note has several lines so the masonry layout must measure its actual rendered height.\nAnother line keeps the cards intentionally uneven.`,
          color: index === 1 ? 'yellow' : index === 2 ? 'blue' : 'default',
        });
        created.push({ id: note.id, title: note.title });
      }

      if (shouldPin && created[0]) {
        await repository.setPinned(created[0].id, true);
      }

      return created;
    },
    { shouldPin: includePinned, noteCount: count },
  );
}

test('renders pinned and other notes in a responsive masonry grid', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedNotes(page, { includePinned: true, count: 6 });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Pinned', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Others', level: 2 })).toBeVisible();
  await expect(page.locator('[data-note-card]')).toHaveCount(6);

  const otherCards = page.getByRole('list', { name: 'Others notes' }).locator('[data-note-card]');
  const boxes = await otherCards.evaluateAll((cards) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: Math.round(rect.x), height: Math.round(rect.height) };
    }),
  );

  expect(new Set(boxes.map((box) => box.x)).size).toBeGreaterThan(1);
  expect(new Set(boxes.map((box) => box.height)).size).toBeGreaterThan(1);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('persists list view and places cards in one column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedNotes(page, { count: 4 });
  await page.reload();

  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('list', { name: 'Saved notes' })).toHaveAttribute(
    'data-view',
    'list',
  );

  const xPositions = await page
    .getByRole('list', { name: 'Saved notes' })
    .locator('[data-note-card]')
    .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().x)));
  expect(new Set(xPositions).size).toBe(1);

  await page.reload();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('list', { name: 'Saved notes' })).toHaveAttribute(
    'data-view',
    'list',
  );
});

test('opens a card editor and recovers an edit across an immediate reload', async ({ page }) => {
  await page.goto('./');
  const noteId = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const note = await repository.create({ title: 'Editable', content: 'Original body' });
    return note.id;
  });
  await page.reload();

  await page.getByRole('button', { name: 'Open note: Editable' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit note' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Edit note text').fill('Recovered edit before debounce.');
  await expect
    .poll(() => page.evaluate(() => Boolean(localStorage.getItem('notes.editor-draft.v1'))))
    .toBe(true);

  await page.reload();

  const recoveredDialog = page.getByRole('dialog', { name: 'Edit note' });
  await expect(recoveredDialog).toBeVisible();
  await expect(recoveredDialog.getByLabel('Edit note text')).toHaveValue(
    'Recovered edit before debounce.',
  );
  await recoveredDialog.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('button', { name: 'Open note: Editable' })).toContainText(
    'Recovered edit before debounce.',
  );

  const stored = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    return repository.require(id);
  }, noteId);
  expect(stored.content).toBe('Recovered edit before debounce.');
});

test('keeps the note grid usable at the minimum supported viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await seedNotes(page, { count: 3 });
  await page.reload();

  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
