from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text()
    if content.count(old) != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {content.count(old)}")
    target.write_text(content.replace(old, new, 1))


replace_once(
    "src/app/AppShell.tsx",
    "import { Suspense, lazy, useCallback, useEffect, useState } from 'react';",
    "import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';",
)
replace_once(
    "src/app/AppShell.tsx",
    "  const [captureRequest, setCaptureRequest] = useState<CaptureRequest | null>(null);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());",
    "  const [captureRequest, setCaptureRequest] = useState<CaptureRequest | null>(null);\n  const captureRequestIdRef = useRef(0);\n  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());",
)
replace_once(
    "src/app/AppShell.tsx",
    "      setCaptureRequest((current) => ({ id: (current?.id ?? 0) + 1, kind }));",
    "      captureRequestIdRef.current += 1;\n      setCaptureRequest({ id: captureRequestIdRef.current, kind });",
)

commands = ROOT / "e2e/commands.spec.ts"
content = commands.read_text()
marker = "test('J and K cycle focus through visible cards and Enter opens the focused note', async ({"
if marker not in content:
    raise RuntimeError("commands insertion marker not found")
test = """test('repeated C shortcuts create distinct capture requests', async ({ page }) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);

  await page.keyboard.press('c');
  const first = page.getByRole('form', { name: 'New note' });
  await expect(first).toBeVisible();
  await first.getByLabel('Title').fill('First capture request');
  await first.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-note-card]').filter({ hasText: 'First capture request' })).toBeVisible();

  await page.keyboard.press('c');
  const second = page.getByRole('form', { name: 'New note' });
  await expect(second).toBeVisible();
  await expect(second.getByLabel('Note text')).toBeFocused();
});

"""
commands.write_text(content.replace(marker, test + marker, 1))

print('V3.9 capture sequencing fix applied')
