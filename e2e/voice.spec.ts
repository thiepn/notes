import { expect, test, type Page } from '@playwright/test';

async function installFakeMicrophone(page: Page, options: { denied?: boolean } = {}) {
  await page.addInitScript(({ denied }) => {
    class FakeTrack {
      stop() {}
    }

    class FakeStream {
      private readonly tracks = [new FakeTrack()];

      getTracks() {
        return this.tracks;
      }
    }

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(mimeType: string) {
        return mimeType === 'audio/webm;codecs=opus' || mimeType === 'audio/webm';
      }

      state: RecordingState = 'inactive';
      readonly mimeType: string;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType || 'audio/webm;codecs=opus';
      }

      start() {
        this.state = 'recording';
      }

      pause() {
        if (this.state === 'recording') this.state = 'paused';
      }

      resume() {
        if (this.state === 'paused') this.state = 'recording';
      }

      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        queueMicrotask(() => {
          const dataEvent = new Event('dataavailable');
          Object.defineProperty(dataEvent, 'data', {
            value: new Blob(['fake voice recording payload'], { type: this.mimeType }),
          });
          this.dispatchEvent(dataEvent);
          this.dispatchEvent(new Event('stop'));
        });
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
          return new FakeStream() as unknown as MediaStream;
        },
      },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
  }, options);
}

async function stopAndSaveRecording(page: Page) {
  const recorder = page.getByRole('dialog', { name: 'Voice recorder' });
  await expect(recorder.getByText('Recording', { exact: true })).toBeVisible();
  await recorder.getByRole('button', { name: 'Pause' }).click();
  await expect(recorder.getByText('Paused', { exact: true })).toBeVisible();
  await recorder.getByRole('button', { name: 'Resume' }).click();
  await recorder.getByRole('button', { name: 'Stop' }).click();
  await expect(recorder.getByText('Recording ready')).toBeVisible();
  await expect(recorder.getByLabel('Voice recording preview')).toBeVisible();
  await recorder.getByRole('button', { name: 'Save recording' }).click();
  await expect(recorder).toHaveCount(0);
}

test('quick voice capture creates an attachment-only note with inline playback', async ({
  page,
}) => {
  await installFakeMicrophone(page);
  await page.goto('./');

  await page.getByRole('button', { name: 'Record voice note' }).click();
  const recorder = page.getByRole('dialog', { name: 'Voice recorder' });
  await expect(recorder).toBeVisible();
  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();

  await stopAndSaveRecording(page);

  const attachments = page.getByRole('region', { name: 'Attachments' });
  await expect(attachments).toContainText('1 attachment');
  await expect(attachments.getByLabel('Voice recordings')).toBeVisible();
  await expect(attachments.getByLabel(/Play voice recording:/u)).toBeVisible();

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await db.notesDatabase.notes.toArray();
    const rows = await db.notesDatabase.attachments.toArray();
    const attachment = rows[0];
    return attachment
      ? {
          noteCount: notes.length,
          title: notes[0]?.title ?? null,
          content: notes[0]?.content ?? null,
          mimeType: attachment.mimeType,
          name: attachment.name,
          size: attachment.size,
          blobType: attachment.data.type,
        }
      : null;
  });

  expect(stored).toMatchObject({
    noteCount: 1,
    title: '',
    content: '',
    mimeType: 'audio/webm;codecs=opus',
    blobType: 'audio/webm;codecs=opus',
  });
  expect(stored?.name).toMatch(/^voice-.*\.webm$/u);
  expect(stored?.size ?? 0).toBeGreaterThan(0);

  await page.getByRole('form', { name: 'New note' }).getByRole('button', { name: 'Close' }).click();
  const card = page.locator('[data-note-card]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.note-card-audio-count')).toContainText('1 voice recording');
});

test('Escape closes only the voice recorder and existing text notes can save recordings', async ({
  page,
}) => {
  await installFakeMicrophone(page);
  await page.goto('./');
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: 'Voice target', content: 'Keep this editor open.' })).id;
  });
  await page.reload();

  await page.locator(`[data-note-id="${noteId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Record voice note' }).click();
  await expect(page.getByRole('dialog', { name: 'Voice recorder' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Voice recorder' })).toHaveCount(0);
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: 'Record voice note' }).click();
  await stopAndSaveRecording(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Voice recordings')).toBeVisible();

  const audioCount = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const rows = await db.notesDatabase.attachments.where('noteId').equals(id).toArray();
    return rows.filter((row) => row.mimeType.startsWith('audio/')).length;
  }, noteId);
  expect(audioCount).toBe(1);
});

test('checklist editors share the voice-recording attachment workflow', async ({ page }) => {
  await installFakeMicrophone(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const form = page.getByRole('form', { name: 'New checklist' });
  await form.getByLabel('Checklist title').fill('Voice checklist');
  await form.getByLabel('Checklist item 1').fill('First item');
  await form.getByRole('button', { name: 'Close' }).click();

  const card = page.locator('[data-note-type="checklist"]').filter({ hasText: 'Voice checklist' });
  await card.getByRole('button', { name: 'Open note: Voice checklist' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await editor.getByRole('button', { name: 'Record voice note' }).click();
  await stopAndSaveRecording(page);

  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Voice recordings')).toBeVisible();
});

test('microphone denial is explained without creating a note or attachment', async ({ page }) => {
  await installFakeMicrophone(page, { denied: true });
  await page.goto('./');

  await page.getByRole('button', { name: 'Record voice note' }).click();
  const recorder = page.getByRole('dialog', { name: 'Voice recorder' });
  await expect(recorder.getByText('Microphone unavailable')).toBeVisible();
  await expect(recorder.getByRole('alert')).toContainText('Microphone access was blocked');
  await recorder.getByRole('button', { name: 'Cancel' }).click();

  const counts = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return {
      notes: await db.notesDatabase.notes.count(),
      attachments: await db.notesDatabase.attachments.count(),
    };
  });
  expect(counts).toEqual({ notes: 0, attachments: 0 });
});
