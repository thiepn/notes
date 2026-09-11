import { expect, test, type Locator, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function openConnections(page: Page, noteId: string) {
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card).toBeVisible();
  await card.locator('.note-card-open').click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'More', exact: true }).click();
  await editor.getByRole('menuitem', { name: 'Connections', exact: true }).click();
  return editor.getByRole('region', { name: 'Connections' });
}

async function seedIntelligenceLibrary(page: Page) {
  await page.goto('./');
  await waitForNotes(page);
  const seeded = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const study = await labels.create('Study');
    const project = await labels.create('Project');

    const source = await notes.create({
      title: 'Analysis exam',
      content: 'Jordan matrix eigenvalues basis convergence proof review',
    });
    const relatedA = await notes.create({
      title: 'Jordan matrix practice',
      content: 'Jordan matrix eigenvalues basis diagonalization proof exercises',
    });
    const relatedB = await notes.create({
      title: 'Analysis proof review',
      content: 'matrix eigenvalues basis convergence proof summary',
    });
    await labels.assign(relatedA.id, study.id);
    await labels.assign(relatedB.id, study.id);
    await labels.assign(relatedA.id, project.id);

    const duplicate = await notes.create({
      title: 'Analysis exam',
      content: 'Jordan matrix eigenvalues basis convergence proof review',
    });

    const backlink = await notes.create({
      title: 'Weekly review',
      content: 'Before the mock exam, revisit [[Analysis exam]] and compare the proof checklist.',
    });

    return {
      sourceId: source.id,
      relatedAId: relatedA.id,
      relatedBId: relatedB.id,
      duplicateId: duplicate.id,
      backlinkId: backlink.id,
      studyId: study.id,
    };
  });
  await page.reload();
  await waitForNotes(page);
  return seeded;
}

function group(connections: Locator, heading: string) {
  return connections
    .locator('.note-connection-group')
    .filter({ has: connections.getByRole('heading', { name: heading, exact: true }) });
}

test('connections separate possible duplicates and explain richer local related-note signals', async ({
  page,
}) => {
  const ids = await seedIntelligenceLibrary(page);
  const connections = await openConnections(page, ids.sourceId);

  const duplicates = group(connections, 'Possible duplicates');
  await expect(duplicates).toBeVisible();
  await expect(duplicates.getByRole('button', { name: /Analysis exam/u })).toContainText(
    'Same title and content',
  );

  const related = group(connections, 'Related notes');
  await expect(related).toBeVisible();
  await expect(related.getByRole('button', { name: /Jordan matrix practice/u })).toBeVisible();
  await expect(related.getByRole('button', { name: /Analysis proof review/u })).toBeVisible();
  await expect(related).toContainText(/Shared:/u);

  const backlinks = group(connections, 'Backlinks');
  await expect(backlinks.getByRole('button', { name: /Weekly review/u })).toContainText(
    'revisit Analysis exam',
  );
});

test('suggested existing labels can be applied locally and refresh the visible card state', async ({
  page,
}) => {
  const ids = await seedIntelligenceLibrary(page);
  const connections = await openConnections(page, ids.sourceId);

  const suggestions = group(connections, 'Suggested labels');
  const addStudy = suggestions.getByRole('button', { name: 'Add suggested label Study' });
  await expect(addStudy).toBeVisible();
  await expect(addStudy).toContainText('2 related');
  await addStudy.click();
  await expect(addStudy).toHaveCount(0);

  const stored = await page.evaluate(async (seed) => {
    const db = await import('/notes/src/db/index.ts');
    const labels = new db.LabelsRepository(db.notesDatabase);
    return labels.labelIdsForNote(seed.sourceId);
  }, ids);
  expect(stored).toContain(ids.studyId);

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Close' }).click();
  const card = page.locator(`[data-note-id="${ids.sourceId}"]`);
  await expect(card.locator('.note-label-chip').filter({ hasText: /^Study$/u })).toBeVisible();
});

test('local topics summarize recurring library evidence without creating new persistent objects', async ({
  page,
}) => {
  const ids = await seedIntelligenceLibrary(page);
  const connections = await openConnections(page, ids.sourceId);
  const topics = group(connections, 'Local topics');

  await expect(topics).toBeVisible();
  await expect(topics.getByText('Study', { exact: true })).toBeVisible();
  await expect(topics).toContainText(/2 notes/u);

  const counts = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return {
      settings: await db.notesDatabase.settings.count(),
      labels: await db.notesDatabase.labels.count(),
    };
  });
  expect(counts.labels).toBe(2);
  expect(counts.settings).toBeGreaterThanOrEqual(0);
});
