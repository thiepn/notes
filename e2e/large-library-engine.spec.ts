import { expect, test } from '@playwright/test';

async function seedNotes(page: import('@playwright/test').Page, count: number, needleIndex = -1) {
  await page.evaluate(
    async ({ count: noteCount, needleIndex: targetIndex }) => {
      const db = await import('/notes/src/db/index.ts');
      const now = Date.now();
      await db.notesDatabase.notes.bulkPut(
        Array.from({ length: noteCount }, (_, index) => ({
          id: crypto.randomUUID(),
          type: 'text' as const,
          title: index === targetIndex ? 'Worker needle target' : `Scale note ${index + 1}`,
          content: index === targetIndex ? 'Incremental search target body' : `Body ${index + 1}`,
          color: 'default' as const,
          createdAt: now - index,
          updatedAt: now - index,
          pinnedAt: null,
          archivedAt: null,
          trashedAt: null,
          position: index,
          revision: 1,
        })),
      );
    },
    { count, needleIndex },
  );
}

test('large libraries progressively mount note cards instead of mounting the whole collection', async ({
  page,
}) => {
  await page.goto('./');
  await seedNotes(page, 1000);
  await page.reload();

  const cards = page.locator('[data-note-card]');
  await expect(cards.first()).toBeVisible();
  const initialMounted = await cards.count();
  expect(initialMounted).toBeGreaterThan(0);
  expect(initialMounted).toBeLessThan(300);

  const grid = page.getByRole('list', { name: /notes/i }).first();
  await expect(grid).toHaveAttribute('data-total-count', '1000');
  await expect(grid).not.toHaveAttribute('data-mounted-count', '1000');

  const loadMore = page.getByRole('button', { name: /Show more notes/ }).first();
  if (await loadMore.isVisible()) {
    const before = await cards.count();
    await loadMore.click();
    await expect.poll(() => cards.count()).toBeGreaterThan(before);
  }
});

test('search uses a worker and note edits refresh the index without a full-library reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const workerUrls: string[] = [];
    Object.defineProperty(window, '__notesWorkerUrls', { value: workerUrls, configurable: true });
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: new Proxy(NativeWorker, {
        construct(target, args) {
          workerUrls.push(String(args[0]));
          return Reflect.construct(target, args);
        },
      }),
    });
  });

  await page.goto('./');
  await seedNotes(page, 1200, 777);
  await page.reload();

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('Worker needle target');
  await expect(page.getByRole('button', { name: 'Open note: Worker needle target' })).toBeVisible();

  const workerUrls = await page.evaluate(
    () => (window as Window & { __notesWorkerUrls?: string[] }).__notesWorkerUrls ?? [],
  );
  expect(workerUrls.some((url) => url.includes('search.worker'))).toBe(true);

  await page.evaluate(async () => {
    const searchModule = await import('/notes/src/features/search/searchRepository.ts');
    searchModule.SearchRepository.prototype.loadIndex = async () => {
      throw new Error('Full search-index reload is forbidden after initial load.');
    };
  });

  await page.getByRole('button', { name: 'Open note: Worker needle target' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByLabel('Title').fill('Worker renamed target');
  await editor.getByRole('button', { name: 'Close' }).click();

  await search.fill('Worker renamed target');
  await expect(
    page.getByRole('button', { name: 'Open note: Worker renamed target' }),
  ).toBeVisible();
  await expect(page.getByText('Search index could not be refreshed.')).toHaveCount(0);
});
