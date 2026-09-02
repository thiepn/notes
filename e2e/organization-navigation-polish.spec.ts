import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedOrganizationLibrary(page: Page) {
  await page.goto('./');
  await waitForNotes(page);

  const seeded = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const reminders = new db.RemindersRepository(db.notesDatabase);

    const alpha = await notes.create({ title: 'Active Alpha', content: 'First active note.' });
    const beta = await notes.create({ title: 'Active Beta', content: 'Second active note.' });
    await notes.create({ title: 'Active Gamma', content: 'Third active note.' });

    const archived = await notes.create({ title: 'Already Archived', content: 'Archive seed.' });
    await notes.archive(archived.id, archived.revision);
    const trashed = await notes.create({ title: 'Already Trashed', content: 'Trash seed.' });
    await notes.trash(trashed.id, trashed.revision);

    const labelNames = ['Project', 'Ideas', 'Church', 'Study', 'Travel', 'Reference'];
    const createdLabels = [];
    for (const name of labelNames) createdLabels.push(await labels.create(name));
    const project = createdLabels.find((label) => label.name === 'Project');
    const ideas = createdLabels.find((label) => label.name === 'Ideas');
    if (!project || !ideas) throw new Error('Failed to seed labels.');

    await labels.assign(alpha.id, project.id);
    await labels.assign(beta.id, project.id);
    await labels.assign(alpha.id, ideas.id);

    await reminders.set(alpha.id, {
      dueAt: Date.now() + 60 * 60 * 1000,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });

    return { alphaId: alpha.id, projectId: project.id, ideasId: ideas.id };
  });

  await page.reload();
  await waitForNotes(page);
  return seeded;
}

function sidebarCount(page: Page, label: string) {
  return page
    .getByTestId('app-sidebar')
    .getByRole('button', { name: label, exact: true })
    .locator('.nav-count');
}

test('sidebar and workspace expose derived collection and label counts', async ({ page }) => {
  await seedOrganizationLibrary(page);

  await expect(sidebarCount(page, 'Notes')).toHaveText('3');
  await expect(sidebarCount(page, 'Reminders')).toHaveText('1');
  await expect(sidebarCount(page, 'Archive')).toHaveText('1');
  await expect(sidebarCount(page, 'Trash')).toHaveText('1');
  await expect(sidebarCount(page, 'Project')).toHaveText('2');
  await expect(sidebarCount(page, 'Ideas')).toHaveText('1');
  await expect(page.locator('.workspace-count')).toHaveText('3 notes');
});

test('large label lists can be filtered and label workspaces show their active-note count', async ({
  page,
}) => {
  await seedOrganizationLibrary(page);
  const sidebar = page.getByTestId('app-sidebar');
  const findLabels = sidebar.getByRole('searchbox', { name: 'Find labels' });
  await expect(findLabels).toBeVisible();

  await findLabels.fill('proj');
  await expect(sidebar.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Ideas', exact: true })).toHaveCount(0);

  await sidebar.getByRole('button', { name: 'Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project', level: 1 })).toBeVisible();
  await expect(page.locator('.workspace-count')).toHaveText('2 notes');
  await expect(sidebar.getByRole('searchbox', { name: 'Find labels' })).toHaveValue('');
});

test('command palette opens labels directly with useful count context', async ({ page }) => {
  await seedOrganizationLibrary(page);

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const input = palette.getByRole('combobox', { name: 'Search commands' });
  await input.fill('Open label: Ideas');
  const option = palette.getByRole('option', { name: /Open label: Ideas.*1 active note/u });
  await expect(option).toBeVisible();
  await option.click();

  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();
  await expect(page.locator('.workspace-count')).toHaveText('1 note');
});

test('collection counts refresh after normal lifecycle mutations', async ({ page }) => {
  const seeded = await seedOrganizationLibrary(page);

  const alphaCard = page.locator(`[data-note-id="${seeded.alphaId}"]`);
  await alphaCard
    .getByRole('button', { name: 'Archive note: Active Alpha' })
    .click({ force: true });

  await expect(alphaCard).toHaveCount(0);
  await expect(sidebarCount(page, 'Notes')).toHaveText('2');
  await expect(sidebarCount(page, 'Archive')).toHaveText('2');
  await expect(sidebarCount(page, 'Project')).toHaveText('1');
  await expect(sidebarCount(page, 'Ideas')).toHaveText('0');
  await expect(page.locator('.workspace-count')).toHaveText('2 notes');
});
