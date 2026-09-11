import { expect, test } from '@playwright/test';

test('relation hydration uses noteId indexes instead of full-table scans', async ({ page }) => {
  await page.goto('./');

  const result = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const noteA = crypto.randomUUID();
    const noteB = crypto.randomUUID();
    const labelA = crypto.randomUUID();
    const labelB = crypto.randomUUID();
    const now = Date.now();

    await db.notesDatabase.noteLabels.bulkPut([
      { noteId: noteA, labelId: labelA, assignedAt: now },
      { noteId: noteB, labelId: labelB, assignedAt: now + 1 },
      ...Array.from({ length: 2_000 }, (_, index) => ({
        noteId: crypto.randomUUID(),
        labelId: crypto.randomUUID(),
        assignedAt: now + index + 2,
      })),
    ]);
    await db.notesDatabase.checklistItems.bulkPut([
      {
        id: crypto.randomUUID(),
        noteId: noteA,
        text: 'Relevant A',
        checked: false,
        parentId: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        noteId: noteB,
        text: 'Relevant B',
        checked: true,
        parentId: null,
        position: 0,
        createdAt: now + 1,
        updatedAt: now + 1,
      },
      ...Array.from({ length: 2_000 }, (_, index) => ({
        id: crypto.randomUUID(),
        noteId: crypto.randomUUID(),
        text: `Noise ${index}`,
        checked: false,
        parentId: null,
        position: 0,
        createdAt: now + index + 2,
        updatedAt: now + index + 2,
      })),
    ]);

    Object.defineProperty(db.notesDatabase.noteLabels, 'toArray', {
      configurable: true,
      value: () => Promise.reject(new Error('full noteLabels scan forbidden')),
    });
    Object.defineProperty(db.notesDatabase.checklistItems, 'toArray', {
      configurable: true,
      value: () => Promise.reject(new Error('full checklistItems scan forbidden')),
    });

    const labels = new db.LabelsRepository(db.notesDatabase);
    const checklists = new db.ChecklistsRepository(db.notesDatabase);
    const [labelIdsByNote, checklistItemsByNote] = await Promise.all([
      labels.labelIdsByNote([noteA, noteB, noteA]),
      checklists.itemsByNote([noteA, noteB, noteA]),
    ]);

    return {
      noteA,
      noteB,
      labelIdsByNote,
      checklistItemsByNote: Object.fromEntries(
        Object.entries(checklistItemsByNote).map(([noteId, items]) => [
          noteId,
          items.map((item) => item.text),
        ]),
      ),
    };
  });

  expect(result.labelIdsByNote[result.noteA]).toHaveLength(1);
  expect(result.labelIdsByNote[result.noteB]).toHaveLength(1);
  expect(result.checklistItemsByNote[result.noteA]).toEqual(['Relevant A']);
  expect(result.checklistItemsByNote[result.noteB]).toEqual(['Relevant B']);
});

test('attachment card metadata avoids Blob reads unless an image thumbnail is needed', async ({
  page,
}) => {
  await page.goto('./');

  const result = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const summaryModule = await import('/notes/src/features/notes/attachmentCardSummary.ts');
    const noteId = crypto.randomUUID();
    const now = Date.now();
    await db.notesDatabase.attachments.bulkPut([
      {
        id: crypto.randomUUID(),
        noteId,
        name: 'reference.pdf',
        mimeType: 'application/pdf',
        size: 2_000_000,
        checksum: 'pdf-checksum',
        data: new Blob([new Uint8Array(2_000_000)], { type: 'application/pdf' }),
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        noteId,
        name: 'voice.webm',
        mimeType: 'audio/webm',
        size: 1_000_000,
        checksum: 'audio-checksum',
        data: new Blob([new Uint8Array(1_000_000)], { type: 'audio/webm' }),
        createdAt: now + 1,
      },
    ]);

    const table = db.notesDatabase.attachments;
    const originalGet = table.get.bind(table);
    let blobRecordReads = 0;
    Object.defineProperty(table, 'get', {
      configurable: true,
      value: (...args: Parameters<typeof originalGet>) => {
        blobRecordReads += 1;
        return originalGet(...args);
      },
    });

    const metadataOnly = await summaryModule.loadAttachmentCardSummary(noteId);

    const imageId = crypto.randomUUID();
    await table.put({
      id: imageId,
      noteId,
      name: 'preview.png',
      mimeType: 'image/png',
      size: 4,
      checksum: 'image-checksum',
      data: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
      createdAt: now + 2,
    });
    const withImage = await summaryModule.loadAttachmentCardSummary(noteId);

    return {
      metadataOnly: {
        count: metadataOnly.count,
        imageCount: metadataOnly.imageCount,
        audioCount: metadataOnly.audioCount,
        firstImage: metadataOnly.firstImage?.id ?? null,
      },
      withImage: {
        count: withImage.count,
        imageCount: withImage.imageCount,
        audioCount: withImage.audioCount,
        firstImage: withImage.firstImage?.id ?? null,
      },
      imageId,
      blobRecordReads,
    };
  });

  expect(result.metadataOnly).toEqual({ count: 2, imageCount: 0, audioCount: 1, firstImage: null });
  expect(result.withImage).toEqual({
    count: 3,
    imageCount: 1,
    audioCount: 1,
    firstImage: result.imageId,
  });
  expect(result.blobRecordReads).toBe(1);
});

test('a 5,000-note library keeps the initial DOM window bounded on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const now = Date.now();
    await db.notesDatabase.notes.bulkPut(
      Array.from({ length: 5_000 }, (_, index) => ({
        id: crypto.randomUUID(),
        type: 'text' as const,
        title: `P18 scale note ${index + 1}`,
        content: `Body ${index + 1}`,
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
  });
  await page.reload();

  const grid = page.getByRole('list', { name: 'Saved notes' });
  await expect(grid).toHaveAttribute('data-total-count', '5000');
  await expect(grid).toHaveAttribute('data-mount-profile', 'mobile');
  const mounted = Number(await grid.getAttribute('data-mounted-count'));
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThanOrEqual(96);
  expect(await page.locator('[data-note-card]').count()).toBeLessThanOrEqual(96);
});
