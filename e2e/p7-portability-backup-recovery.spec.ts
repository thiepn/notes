import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

async function openBackupTools(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
}

test('portable archive exports the complete library as Markdown, manifest, and original files', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  const ids = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const checklists = new db.ChecklistsRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const reminders = new db.RemindersRepository(db.notesDatabase);

    let text = await notes.create({
      title: 'P7 portable / note',
      content: 'Portable text body with [[Wiki target]].',
      color: 'purple',
    });
    const label = await labels.create('Portable Label');
    await labels.assign(text.id, label.id);
    text = await notes.archive(text.id, text.revision);
    await reminders.set(text.id, {
      dueAt: Date.now() + 3_600_000,
      timeZone: 'Europe/Berlin',
    });

    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const checklist = await checklists.create('P7 portable checklist', [
      { id: parentId, text: 'Parent portable task', checked: true, parentId: null },
      { id: childId, text: 'Child portable task', checked: false, parentId },
    ]);

    const bytes = new TextEncoder().encode('P7 original attachment bytes');
    const attachmentId = crypto.randomUUID();
    await db.notesDatabase.attachments.add({
      id: attachmentId,
      noteId: text.id,
      name: 'source?.txt',
      mimeType: 'text/plain',
      size: bytes.byteLength,
      checksum: 'p7-source-checksum',
      data: new Blob([bytes], { type: 'text/plain' }),
      createdAt: Date.now(),
    });

    return { textId: text.id, checklistId: checklist.note.id, attachmentId };
  });

  await openBackupTools(page);
  await expect(page.getByRole('heading', { name: 'Export a portable library' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download portable archive' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^notes-portable-.*\.zip$/u);
  const path = await download.path();
  expect(path).toBeTruthy();

  const archive = unzipSync(new Uint8Array(await readFile(path!)));
  expect(archive['README.md']).toBeDefined();
  expect(archive['manifest.json']).toBeDefined();

  const manifest = JSON.parse(strFromU8(archive['manifest.json']!)) as {
    format: string;
    counts: {
      notes: number;
      archived: number;
      checklistItems: number;
      labels: number;
      attachments: number;
      reminders: number;
    };
    notes: Array<{
      id: string;
      path: string;
      lifecycle: string;
      labels: string[];
      reminder: { timeZone: string; status: string } | null;
      attachments: Array<{ id: string; path: string; sha256: string }>;
    }>;
  };

  expect(manifest.format).toBe('thiepn.notes.portable');
  expect(manifest.counts).toMatchObject({
    notes: 2,
    archived: 1,
    checklistItems: 2,
    labels: 1,
    attachments: 1,
    reminders: 1,
  });

  const text = manifest.notes.find((note) => note.id === ids.textId)!;
  expect(text.lifecycle).toBe('archived');
  expect(text.labels).toEqual(['Portable Label']);
  expect(text.reminder).toMatchObject({ timeZone: 'Europe/Berlin', status: 'active' });
  expect(text.attachments).toHaveLength(1);
  expect(text.attachments[0]?.id).toBe(ids.attachmentId);
  expect(text.attachments[0]?.sha256).toMatch(/^[a-f0-9]{64}$/u);

  const textMarkdown = strFromU8(archive[text.path]!);
  expect(textMarkdown).toContain('lifecycle: "archived"');
  expect(textMarkdown).toContain('labels: ["Portable Label"]');
  expect(textMarkdown).toContain('Portable text body with [[Wiki target]].');
  expect(textMarkdown).toContain('## Attachments');

  const attachmentPath = text.attachments[0]!.path;
  expect(strFromU8(archive[attachmentPath]!)).toBe('P7 original attachment bytes');

  const checklist = manifest.notes.find((note) => note.id === ids.checklistId)!;
  const checklistMarkdown = strFromU8(archive[checklist.path]!);
  expect(checklistMarkdown).toContain('- [x] Parent portable task');
  expect(checklistMarkdown).toContain('  - [ ] Child portable task');

  await expect(
    page.getByText(/Portable archive downloaded as notes-portable-.*2 notes and 1 attachments/u),
  ).toBeVisible();
});
