import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

function zipBuffer(entries: Record<string, Uint8Array>): Buffer {
  return Buffer.from(zipSync(entries));
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

function takeoutParts() {
  const first = zipBuffer({
    'Takeout/Keep/Imported text.json': json({
      color: 'RED',
      isTrashed: false,
      isPinned: true,
      isArchived: false,
      textContent: 'Imported text body',
      title: 'Imported text',
      userEditedTimestampUsec: '1780000100000000',
      createdTimestampUsec: '1780000000000000',
      labels: [{ name: ' work ' }],
      attachments: [{ filePath: 'photo.png', mimetype: 'image/png' }],
    }),
    'Takeout/Keep/Imported checklist.json': json({
      color: 'CERULEAN',
      isTrashed: false,
      isPinned: false,
      isArchived: true,
      title: 'Imported checklist',
      userEditedTimestampUsec: '1780000300000000',
      createdTimestampUsec: '1780000200000000',
      labels: [{ name: 'Trips' }],
      listContent: [
        {
          text: 'Parent item',
          isChecked: false,
          childItems: [{ text: 'Child item', isChecked: true }],
        },
      ],
    }),
    'Takeout/Keep/Imported trash.json': json({
      color: 'GRAY',
      isTrashed: true,
      isPinned: true,
      isArchived: true,
      textContent: 'Trash body',
      title: 'Imported trash',
      userEditedTimestampUsec: '1780000500000000',
      createdTimestampUsec: '1780000400000000',
    }),
  });
  const second = zipBuffer({
    'Takeout/Keep/photo.png': strToU8('cross-part-image-bytes'),
  });
  return [
    { name: 'takeout-001.zip', mimeType: 'application/zip', buffer: first },
    { name: 'takeout-002.zip', mimeType: 'application/zip', buffer: second },
  ];
}

test('Google Keep Takeout imports non-destructively with metadata, attachments, history, and repeat protection', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  const existing = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = await new db.NotesRepository(db.notesDatabase).create({
      title: 'Existing local note',
      content: 'This must never be replaced.',
      color: 'green',
    });
    const label = await new db.LabelsRepository(db.notesDatabase).create('Work');
    await new db.LabelsRepository(db.notesDatabase).assign(note.id, label.id);
    return { noteId: note.id, labelId: label.id };
  });

  await page.getByRole('button', { name: 'Backup' }).click();
  await expect(page.getByRole('heading', { name: 'Import Google Takeout' })).toBeVisible();
  await page.getByLabel('Choose Google Takeout archives').setInputFiles(takeoutParts());

  await expect(
    page.getByText('Google Keep source inspected. No local notes have been changed.'),
  ).toBeVisible();
  const preview = page.getByLabel('Google Keep import preview');
  await expect(preview).toContainText('2 selected source files');
  await expect(preview).toContainText('3 JSON');
  await expect(preview).toContainText('Ready to import');
  await expect(preview).toContainText('3');
  await preview.getByRole('button', { name: 'Import 3 notes' }).click();

  const importResult = page.getByLabel('Google Keep import result');
  await expect(importResult).toBeVisible();
  await expect(importResult).toContainText('Notes imported');
  await expect(importResult).toContainText('3');

  const imported = await page.evaluate(async (expected) => {
    const db = await import('/notes/src/db/index.ts');
    const [notes, items, labels, links, attachments, revisions, settings] = await Promise.all([
      db.notesDatabase.notes.toArray(),
      db.notesDatabase.checklistItems.toArray(),
      db.notesDatabase.labels.toArray(),
      db.notesDatabase.noteLabels.toArray(),
      db.notesDatabase.attachments.toArray(),
      db.notesDatabase.revisions.toArray(),
      db.notesDatabase.settings.toArray(),
    ]);
    const text = notes.find((note) => note.title === 'Imported text');
    const checklist = notes.find((note) => note.title === 'Imported checklist');
    const trash = notes.find((note) => note.title === 'Imported trash');
    const attachment = text ? attachments.find((record) => record.noteId === text.id) : undefined;
    const workLabels = labels.filter((label) => label.nameNormalized === 'work');
    const trips = labels.find((label) => label.nameNormalized === 'trips');
    const checklistRows = checklist
      ? items.filter((item) => item.noteId === checklist.id).sort((a, b) => a.position - b.position)
      : [];

    return {
      localNote: notes.find((note) => note.id === expected.noteId) ?? null,
      totalNotes: notes.length,
      text: text
        ? {
            id: text.id,
            type: text.type,
            content: text.content,
            color: text.color,
            createdAt: text.createdAt,
            updatedAt: text.updatedAt,
            pinnedAt: text.pinnedAt,
            archivedAt: text.archivedAt,
            trashedAt: text.trashedAt,
          }
        : null,
      checklist: checklist
        ? {
            id: checklist.id,
            type: checklist.type,
            color: checklist.color,
            pinnedAt: checklist.pinnedAt,
            archivedAt: checklist.archivedAt,
            trashedAt: checklist.trashedAt,
          }
        : null,
      trash: trash
        ? {
            pinnedAt: trash.pinnedAt,
            archivedAt: trash.archivedAt,
            trashedAt: trash.trashedAt,
          }
        : null,
      checklistRows: checklistRows.map((item) => ({
        id: item.id,
        text: item.text,
        checked: item.checked,
        parentId: item.parentId,
      })),
      workLabelIds: workLabels.map((label) => label.id),
      textLabelIds: text
        ? links.filter((link) => link.noteId === text.id).map((link) => link.labelId)
        : [],
      tripsLabelId: trips?.id ?? null,
      checklistLabelIds: checklist
        ? links.filter((link) => link.noteId === checklist.id).map((link) => link.labelId)
        : [],
      attachmentText: attachment ? await attachment.data.text() : null,
      attachmentChecksum: attachment?.checksum ?? null,
      importRevisionReasons: revisions
        .filter((revision) =>
          notes.some((note) => note.id === revision.noteId && note.id !== expected.noteId),
        )
        .map((revision) => revision.reason),
      ledgerKeys: settings
        .filter((setting) => setting.key.startsWith('google-keep-import:v1:'))
        .map((setting) => setting.key),
    };
  }, existing);

  expect(imported.localNote).toEqual(
    expect.objectContaining({
      id: existing.noteId,
      title: 'Existing local note',
      content: 'This must never be replaced.',
      color: 'green',
    }),
  );
  expect(imported.totalNotes).toBe(4);
  expect(imported.text).toEqual(
    expect.objectContaining({
      type: 'text',
      content: 'Imported text body',
      color: 'red',
      createdAt: 1_780_000_000_000,
      updatedAt: 1_780_000_100_000,
      archivedAt: null,
      trashedAt: null,
    }),
  );
  expect(imported.text?.pinnedAt).toBe(1_780_000_100_000);
  expect(imported.checklist).toEqual(
    expect.objectContaining({
      type: 'checklist',
      color: 'blue',
      pinnedAt: null,
      trashedAt: null,
    }),
  );
  expect(imported.checklist?.archivedAt).toBe(1_780_000_300_000);
  expect(imported.trash?.pinnedAt).toBeNull();
  expect(imported.trash?.archivedAt).toBeNull();
  expect(imported.trash?.trashedAt).toBe(1_780_000_500_000);
  expect(imported.checklistRows).toHaveLength(2);
  expect(imported.checklistRows[0]).toEqual(
    expect.objectContaining({ text: 'Parent item', checked: false, parentId: null }),
  );
  expect(imported.checklistRows[1]).toEqual(
    expect.objectContaining({
      text: 'Child item',
      checked: true,
      parentId: imported.checklistRows[0]?.id,
    }),
  );
  expect(imported.workLabelIds).toEqual([existing.labelId]);
  expect(imported.textLabelIds).toContain(existing.labelId);
  expect(imported.tripsLabelId).toBeTruthy();
  expect(imported.checklistLabelIds).toContain(imported.tripsLabelId);
  expect(imported.attachmentText).toBe('cross-part-image-bytes');
  expect(imported.attachmentChecksum).toMatch(/^[a-f0-9]{64}$/u);
  expect(imported.importRevisionReasons).toHaveLength(3);
  expect(imported.importRevisionReasons.every((reason) => reason === 'import')).toBe(true);
  expect(imported.ledgerKeys).toHaveLength(3);

  await page.getByLabel('Choose Google Takeout archives').setInputFiles(takeoutParts());
  const repeatPreview = page.getByLabel('Google Keep import preview');
  await expect(repeatPreview).toContainText('Already imported');
  await expect(repeatPreview).toContainText('3');
  await expect(
    repeatPreview.getByRole('button', { name: 'Nothing selected to import' }),
  ).toBeDisabled();
  const noteCount = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return db.notesDatabase.notes.count();
  });
  expect(noteCount).toBe(4);
});

test('Google Keep import rolls back every table when a later attachment write fails', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  const result = await page.evaluate(
    async (zipBytes) => {
      const db = await import('/notes/src/db/index.ts');
      const parser = await import('/notes/src/features/import/googleKeepImport.ts');
      const importer = await import('/notes/src/features/import/googleKeepRepository.ts');
      const existing = await new db.NotesRepository(db.notesDatabase).create({
        title: 'Rollback local note',
        content: 'Must survive importer failure.',
      });
      const bytes = new Uint8Array(zipBytes);
      const file = new File([bytes], 'rollback-takeout.zip', { type: 'application/zip' });
      const prepared = await parser.prepareGoogleKeepImport([file]);
      const repository = new importer.GoogleKeepImportRepository(db.notesDatabase);

      const table = db.notesDatabase.attachments as typeof db.notesDatabase.attachments & {
        bulkAdd: typeof db.notesDatabase.attachments.bulkAdd;
      };
      const originalBulkAdd = table.bulkAdd.bind(table);
      table.bulkAdd = (() =>
        Promise.reject(new Error('forced Keep attachment failure'))) as typeof table.bulkAdd;
      let rejected = false;
      try {
        await repository.importPrepared(prepared);
      } catch {
        rejected = true;
      } finally {
        table.bulkAdd = originalBulkAdd;
      }

      const [notes, labels, attachments, revisions, settings] = await Promise.all([
        db.notesDatabase.notes.toArray(),
        db.notesDatabase.labels.toArray(),
        db.notesDatabase.attachments.toArray(),
        db.notesDatabase.revisions.toArray(),
        db.notesDatabase.settings.toArray(),
      ]);
      return {
        rejected,
        local: notes.find((note) => note.id === existing.id) ?? null,
        importedPresent: notes.some((note) => note.title === 'Rollback imported note'),
        importedLabelPresent: labels.some((label) => label.nameNormalized === 'rollback-import'),
        attachmentCount: attachments.length,
        revisionCount: revisions.length,
        ledgerCount: settings.filter((setting) => setting.key.startsWith('google-keep-import:v1:'))
          .length,
      };
    },
    Array.from(
      zipBuffer({
        'Takeout/Keep/Rollback.json': json({
          color: 'YELLOW',
          isPinned: false,
          isArchived: false,
          title: 'Rollback imported note',
          textContent: 'Should not commit.',
          labels: [{ name: 'Rollback Import' }],
          attachments: [{ filePath: 'rollback.png', mimetype: 'image/png' }],
          createdTimestampUsec: '1780010000000000',
          userEditedTimestampUsec: '1780010100000000',
        }),
        'Takeout/Keep/rollback.png': strToU8('rollback-image'),
      }),
    ),
  );

  expect(result.rejected).toBe(true);
  expect(result.local).toEqual(
    expect.objectContaining({
      title: 'Rollback local note',
      content: 'Must survive importer failure.',
    }),
  );
  expect(result.importedPresent).toBe(false);
  expect(result.importedLabelPresent).toBe(false);
  expect(result.attachmentCount).toBe(0);
  expect(result.revisionCount).toBe(0);
  expect(result.ledgerCount).toBe(0);
});

test('a Takeout with no recoverable Keep note is rejected without touching local data', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    await new db.NotesRepository(db.notesDatabase).create({
      title: 'Safe local note',
      content: 'Still here.',
    });
  });

  await page.getByRole('button', { name: 'Backup' }).click();
  await page.getByLabel('Choose Google Takeout archives').setInputFiles({
    name: 'broken-takeout.zip',
    mimeType: 'application/zip',
    buffer: zipBuffer({ 'Takeout/Keep/Broken.json': strToU8('{broken') }),
  });
  await expect(page.getByRole('alert')).toContainText('No importable Google Keep notes were found');
  const titles = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.toArray()).map((note) => note.title);
  });
  expect(titles).toEqual(['Safe local note']);
});
