import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

async function submitRichShare(
  page: Page,
  options: {
    title: string;
    text?: string;
    includeImage?: boolean;
    includePdf?: boolean;
    includeText?: boolean;
    includeUnsupported?: boolean;
  },
) {
  await page.evaluate(async (value) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.action = '/notes/share-target';

    for (const [name, content] of Object.entries({ title: value.title, text: value.text ?? '' })) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = content;
      form.append(input);
    }

    const transfer = new DataTransfer();
    if (value.includeImage) {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable.');
      context.fillRect(0, 0, 4, 4);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('PNG encode failed.'))),
          'image/png',
        );
      });
      transfer.items.add(new File([blob], 'shared-photo.png', { type: 'image/png' }));
    }
    if (value.includePdf) {
      transfer.items.add(
        new File(['%PDF-1.4\nPhase 4 shared reference\n%%EOF'], 'shared-reference.pdf', {
          type: 'application/pdf',
        }),
      );
    }
    if (value.includeText) {
      transfer.items.add(
        new File(['Offline shared attachment'], 'offline-share.txt', { type: 'text/plain' }),
      );
    }
    if (value.includeUnsupported) {
      transfer.items.add(
        new File(['MZ-not-an-app-file'], 'unsupported.exe', {
          type: 'application/x-msdownload',
        }),
      );
    }

    if (transfer.files.length > 0) {
      const files = document.createElement('input');
      files.type = 'file';
      files.name = 'files';
      files.multiple = true;
      files.files = transfer.files;
      form.append(files);
    }

    document.body.append(form);
    form.submit();
  }, options);
}

async function pendingRichShares(page: Page) {
  return page.evaluate(async () => {
    const cache = await caches.open('notes-share-target-v2');
    return (await cache.keys()).filter((request) =>
      new URL(request.url).pathname.startsWith('/notes/share-payload/'),
    ).length;
  });
}

async function setOffline(context: BrowserContext, offline: boolean) {
  await context.setOffline(offline);
}

test('installed PWA captures a shared image and generic file into one durable note', async ({
  page,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);

  await submitRichShare(page, {
    title: 'Phase 4 rich share',
    text: 'Shared with an image and a PDF.',
    includeImage: true,
    includePdf: true,
  });

  await expect(page.getByLabel('Title')).toHaveValue('Phase 4 rich share');
  await expect(page.getByLabel('Note text')).toContainText('Shared with an image and a PDF.');
  const attachments = page.getByRole('region', { name: 'Attachments' });
  await expect(attachments).toContainText('2 attachments');
  await expect(page.getByRole('button', { name: 'Open image: shared-photo.png' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download attachment: shared-reference.pdf' }),
  ).toBeVisible();
  await expect(attachments).toContainText('PDF document');
  expect(await pendingRichShares(page)).toBe(0);
});

test('installed PWA can receive a supported file while the network is offline', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await setOffline(context, true);
  try {
    await submitRichShare(page, {
      title: 'Phase 4 offline share',
      text: 'This share was handed off without network access.',
      includeText: true,
    });

    await expect(page.getByLabel('Title')).toHaveValue('Phase 4 offline share');
    await expect(page.getByLabel('Note text')).toContainText(
      'This share was handed off without network access.',
    );
    const attachments = page.getByRole('region', { name: 'Attachments' });
    await expect(attachments).toContainText('1 attachment');
    await expect(
      page.getByRole('button', { name: 'Download attachment: offline-share.txt' }),
    ).toBeVisible();
    await expect(attachments).toContainText('Text document');
    expect(await pendingRichShares(page)).toBe(0);
  } finally {
    await setOffline(context, false);
  }
});

test('service-worker intake rejects the entire share when any supplied file is unsupported', async ({
  page,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);

  await submitRichShare(page, {
    title: 'Must not become a partial note',
    text: 'The accompanying unsupported file is part of this share.',
    includeText: true,
    includeUnsupported: true,
  });

  await expect(page).toHaveURL(/\/notes\/$/u);
  await expect(
    page.getByRole('button', { name: 'Open note: Must not become a partial note' }),
  ).toHaveCount(0);
  expect(await pendingRichShares(page)).toBe(0);
});
