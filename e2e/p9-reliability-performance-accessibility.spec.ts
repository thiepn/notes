import { expect, test, type Page } from '@playwright/test';

async function seedNotes(page: Page, count: number) {
  return page.evaluate(async (noteCount) => {
    const db = await import('/notes/src/db/index.ts');
    const now = Date.now();
    const records = Array.from({ length: noteCount }, (_, index) => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      title: `P9 scale note ${index + 1}`,
      content: `P9 body ${index + 1}`,
      color: 'default' as const,
      createdAt: now - index,
      updatedAt: now - index,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      position: index,
      revision: 1,
    }));
    await db.notesDatabase.notes.bulkPut(records);
    return records.map((record) => record.id);
  }, count);
}

async function installIdleIntersectionObserver(page: Page) {
  await page.addInitScript(() => {
    class IdleIntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];

      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }

    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: IdleIntersectionObserver,
    });
  });
}

test('lazy workspace failures surface recovery UI without clearing the local library', async ({
  page,
}) => {
  await page.goto('./');
  const [noteId] = await seedNotes(page, 1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open note: P9 scale note 1' })).toBeVisible();

  await page.route('**/src/features/backup/BackupWorkspace.tsx*', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Backup & import' }).click();

  await expect(page.getByRole('heading', { name: 'Notes couldn’t open' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload Notes' })).toBeVisible();
  await expect(page).toHaveTitle('Recovery — Notes');

  const preserved = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return db.notesDatabase.notes.get(id);
  }, noteId);
  expect(preserved).toMatchObject({ id: noteId, title: 'P9 scale note 1' });
});

test('mobile large libraries use a smaller mount window while preserving full list semantics', async ({
  page,
}) => {
  await installIdleIntersectionObserver(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await seedNotes(page, 1000);
  await page.reload();

  await expect(page.locator('[data-runtime-error-boundary]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open note: P9 scale note 1' })).toBeVisible();

  const grid = page.locator('.note-grid').first();
  await expect(grid).toHaveAttribute('data-mount-profile', 'mobile');
  await expect(grid).toHaveAttribute('data-total-count', '1000');
  await expect(grid).toHaveAttribute('data-mounted-count', '48');

  const items = grid.getByRole('listitem');
  await expect(items).toHaveCount(48);
  await expect(items.first()).toHaveAttribute('aria-posinset', '1');
  await expect(items.first()).toHaveAttribute('aria-setsize', '1000');
  await expect(items.nth(47)).toHaveAttribute('aria-posinset', '48');
  await expect(items.nth(47)).toHaveAttribute('aria-setsize', '1000');

  await page
    .getByRole('button', { name: /Show more notes/u })
    .first()
    .click();
  await expect(grid).toHaveAttribute('data-mounted-count', '96');
  await expect(items).toHaveCount(96);
});

test('masonry remains usable when ResizeObserver is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('./');
  await seedNotes(page, 3);
  await page.reload();

  await expect(page.locator('[data-runtime-error-boundary]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open note: P9 scale note 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note: P9 scale note 3' })).toBeVisible();
});

test('workspace changes update document title and an assistive live region', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Notes workspace');

  const sidebar = page.getByTestId('app-sidebar');
  await sidebar.getByRole('button', { name: 'Archive' }).click();
  await expect(page).toHaveTitle('Archive — Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Archive workspace');

  await sidebar.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveTitle('Search — Notes');
  await expect(page.getByTestId('workspace-announcer')).toHaveText('Search workspace');
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();
});
