from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"Expected {expected} matches in {path}, found {count}: {old[:100]!r}"
        )
    file.write_text(text.replace(old, new))


# Text capture: explicit completion restores focus to the capture bar, while
# ordinary outside clicks still close silently without stealing focus.
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "  const composerRef = useRef<HTMLDivElement>(null);\n  const bodyRef = useRef<HTMLTextAreaElement>(null);",
    "  const composerRef = useRef<HTMLDivElement>(null);\n  const bodyRef = useRef<HTMLTextAreaElement>(null);\n  const captureTriggerRef = useRef<HTMLButtonElement>(null);",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {\n    if (event.key === 'Escape') {",
    "  const finishAndRestoreFocus = useCallback(async () => {\n    const finished = await finishCapture();\n    if (!finished) return;\n    window.requestAnimationFrame(() => captureTriggerRef.current?.focus());\n  }, [finishCapture]);\n\n  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {\n    if (event.key === 'Escape') {",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    "      void finishCapture();\n      return;\n    }\n    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {\n      event.preventDefault();\n      void finishCapture();",
    "      void finishAndRestoreFocus();\n      return;\n    }\n    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {\n      event.preventDefault();\n      void finishAndRestoreFocus();",
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    '      <button\n        className="note-composer-main-action"',
    '      <button\n        ref={captureTriggerRef}\n        className="note-composer-main-action"',
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    '        placeholder="Title"\n        autoComplete="off"\n        onChange={(event) => setTitle(event.target.value)}',
    '        placeholder="Title"\n        autoComplete="off"\n        autoCapitalize="sentences"\n        autoCorrect="on"\n        enterKeyHint="next"\n        onChange={(event) => setTitle(event.target.value)}\n        onKeyDown={(event) => {\n          if (event.key !== \'Enter\') return;\n          event.preventDefault();\n          bodyRef.current?.focus();\n        }}',
)
replace_exact(
    "src/features/notes/TextNoteComposer.tsx",
    '        <button className="note-composer-close" type="button" onClick={() => void finishCapture()}>\n          Close\n        </button>',
    '        <button\n          className="note-composer-close"\n          type="button"\n          onClick={() => void finishAndRestoreFocus()}\n        >\n          Close\n        </button>',
)

# Existing note editor: mobile keyboard Next/Enter from the title should move
# directly into note content instead of doing nothing.
replace_exact(
    "src/features/notes/NoteEditorDialog.tsx",
    '            placeholder="Title"\n            autoComplete="off"\n            onChange={(event) => setTitle(event.target.value)}',
    '            placeholder="Title"\n            autoComplete="off"\n            autoCapitalize="sentences"\n            autoCorrect="on"\n            enterKeyHint="next"\n            onChange={(event) => setTitle(event.target.value)}\n            onKeyDown={(event) => {\n              if (event.key !== \'Enter\') return;\n              event.preventDefault();\n              bodyRef.current?.focus();\n            }}',
)

# Checklist capture/editor: title -> first item and mobile-friendly text entry.
replace_exact(
    "src/features/notes/ChecklistEditorFields.tsx",
    '        maxLength={500}\n        autoComplete="off"\n        onChange={(event) => onTitleChange(event.target.value)}',
    '        maxLength={500}\n        autoComplete="off"\n        autoCapitalize="sentences"\n        autoCorrect="on"\n        enterKeyHint="next"\n        onChange={(event) => onTitleChange(event.target.value)}\n        onKeyDown={(event) => {\n          if (event.key !== \'Enter\') return;\n          event.preventDefault();\n          const firstVisible = visibleItems[0] ?? items[0];\n          if (firstVisible) setFocusItemId(firstVisible.id);\n        }}',
)
replace_exact(
    "src/features/notes/ChecklistEditorFields.tsx",
    '                placeholder="List item"\n                autoFocus={autoFocusFirst && absoluteIndex === 0}\n                onChange={(event) => updateText(item.id, event.target.value)}',
    '                placeholder="List item"\n                autoFocus={autoFocusFirst && absoluteIndex === 0}\n                autoCapitalize="sentences"\n                autoCorrect="on"\n                enterKeyHint="next"\n                onChange={(event) => updateText(item.id, event.target.value)}',
)

# Rich text areas keep native mobile writing assistance enabled.
replace_exact(
    "src/features/richText/RichTextEditor.tsx",
    "          rows={rows}\n          autoFocus={autoFocus}\n          onChange={(event) => onChange(event.target.value)}",
    '          rows={rows}\n          autoFocus={autoFocus}\n          autoCapitalize="sentences"\n          autoCorrect="on"\n          spellCheck\n          onChange={(event) => onChange(event.target.value)}',
)

# Load the dedicated V3.1 override layer last.
replace_exact(
    "src/styles.css",
    "@import './styles/ui-simplification.css';\n",
    "@import './styles/ui-simplification.css';\n@import './styles/capture-mobile-polish.css';\n",
)

Path("src/styles/capture-mobile-polish.css").write_text(
    r'''/* V3.1 — Capture & Mobile UX Polish
   Keep capture permanently reachable on phones, prevent keyboard-driven control loss,
   and make touch interaction calmer without removing capability. */

@media (pointer: coarse) {
  .note-composer-quick-action,
  .note-composer-add-button,
  .note-composer-attachments-button,
  .note-editor-secondary,
  .note-composer-close,
  .note-editor-close,
  .rich-text-compact-button,
  .note-card-action {
    min-width: 44px;
    min-height: 44px;
    touch-action: manipulation;
  }

  .checklist-checkbox {
    width: 22px;
    height: 22px;
  }

  .checklist-option-toggle,
  .checklist-completed-actions button {
    min-height: 44px;
  }
}

@media (max-width: 767px) {
  .workspace {
    padding: var(--space-4) var(--space-3) calc(var(--space-10) + env(safe-area-inset-bottom));
  }

  .workspace-heading {
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .workspace-kicker,
  .workspace-heading p:not(.workspace-kicker) {
    display: none;
  }

  .workspace-heading h1 {
    font-size: 1.45rem;
    line-height: 1.15;
    letter-spacing: -0.03em;
  }

  .note-composer-collapsed,
  .note-composer {
    position: sticky;
    top: calc(var(--header-height) + 8px);
    z-index: 12;
  }

  .note-composer-collapsed {
    min-height: 52px;
    padding-left: var(--space-4);
    background: color-mix(in srgb, var(--surface) 96%, transparent);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(14px);
  }

  .note-composer-hints {
    gap: 2px;
  }

  .note-composer-simplified {
    max-height: calc(100dvh - var(--header-height) - 16px);
    padding: var(--space-3);
    overflow: auto;
    overscroll-behavior: contain;
    scroll-padding-bottom: 76px;
    box-shadow: 0 16px 44px rgb(15 18 24 / 18%);
  }

  .note-composer-body,
  .note-editor-body {
    max-height: none;
    overflow: hidden;
  }

  .note-composer-footer-simplified,
  .note-editor-footer-simplified {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-2);
    row-gap: var(--space-1);
  }

  .note-composer-primary-actions,
  .note-editor-primary-actions {
    grid-column: 1;
    grid-row: 2;
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .note-composer-primary-actions::-webkit-scrollbar,
  .note-editor-primary-actions::-webkit-scrollbar {
    display: none;
  }

  .note-composer-footer-simplified > .note-composer-close,
  .note-editor-footer-simplified > .note-editor-footer-actions {
    grid-column: 2;
    grid-row: 2;
    justify-self: end;
  }

  .note-editor-footer-actions {
    flex-wrap: nowrap;
  }

  .note-composer-footer-simplified {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-right: calc(var(--space-3) * -1);
    margin-bottom: calc(var(--space-3) * -1);
    margin-left: calc(var(--space-3) * -1);
    padding: var(--space-2) var(--space-3)
      calc(var(--space-2) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 96%, transparent);
    backdrop-filter: blur(16px);
  }

  .note-editor-dialog-simplified,
  .checklist-editor-dialog.note-editor-dialog-simplified {
    width: 100%;
    height: 100dvh;
    min-height: 0;
    max-height: 100dvh;
    padding: calc(var(--space-4) + env(safe-area-inset-top)) var(--space-4) 0;
    overflow: auto;
    overscroll-behavior: contain;
    scroll-padding-bottom: 76px;
  }

  .note-editor-footer-simplified {
    position: sticky;
    bottom: 0;
    z-index: 6;
    margin-right: calc(var(--space-4) * -1);
    margin-bottom: 0;
    margin-left: calc(var(--space-4) * -1);
    padding: var(--space-2) var(--space-4)
      calc(var(--space-2) + env(safe-area-inset-bottom));
    border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: inherit;
    box-shadow: 0 -10px 24px rgb(15 18 24 / 7%);
  }

  .note-editor-tools-menu,
  .note-editor-more-menu,
  .note-composer-tools-menu-expanded {
    bottom: calc(64px + env(safe-area-inset-bottom));
    max-height: min(56dvh, 440px);
    padding: 8px;
    overflow: auto;
    overscroll-behavior: contain;
    border-radius: 18px;
    box-shadow: 0 18px 48px rgb(15 18 24 / 24%);
  }

  .note-editor-tools-menu button,
  .note-editor-more-menu button,
  .note-composer-tools-menu button {
    min-height: 48px;
    padding: 10px 12px;
    font-size: 0.94rem;
  }

  .rich-text-compact-controls {
    min-height: 36px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .rich-text-compact-controls::-webkit-scrollbar {
    display: none;
  }

  .checklist-row {
    grid-template-columns: 24px 28px minmax(0, 1fr);
    min-height: 44px;
  }

  .checklist-row-actions {
    display: none;
    grid-column: 2 / -1;
    justify-content: flex-end;
    padding: 2px 0 4px;
  }

  .checklist-row:focus-within .checklist-row-actions {
    display: flex;
  }

  .checklist-row-action {
    width: 40px;
    height: 40px;
  }

  .checklist-drag-handle {
    width: 24px;
    height: 40px;
  }

  .checklist-item-input {
    min-height: 40px;
    padding-block: 7px;
  }

  .notes-toolbar {
    min-height: 30px;
    margin-bottom: var(--space-3);
  }

  .notes-count {
    font-size: 0.72rem;
  }
}

@media (max-width: 460px) {
  .note-grid,
  .note-grid[data-view='grid'] {
    grid-template-columns: minmax(0, 1fr);
  }

  .note-card-open {
    min-height: 84px;
  }
}
'''
)

Path("e2e/capture-mobile-polish.spec.ts").write_text(
    r'''import { expect, test, type Page } from '@playwright/test';

async function seedNotes(page: Page, count: number) {
  await page.goto('./');
  await page.evaluate(async (noteCount) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    for (let index = 0; index < noteCount; index += 1) {
      await repository.create({
        title: `Mobile note ${index + 1}`,
        content: `Capture polish content ${index + 1}`,
      });
    }
  }, count);
}

test.describe('V3.1 capture and mobile UX polish', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('capture stays reachable while scrolling and title Enter advances to note content', async ({
    page,
  }) => {
    await seedNotes(page, 18);
    await page.reload();

    const trigger = page.getByRole('button', { name: 'Create a text note' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(trigger).toBeVisible();

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox?.y ?? 999).toBeLessThan(120);

    const firstCardBox = await page.locator('[data-note-card]').first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    expect(firstCardBox?.width ?? 0).toBeGreaterThan(330);

    await trigger.click();
    const composer = page.getByRole('form', { name: 'New note' });
    const title = composer.getByLabel('Title');
    const body = composer.getByLabel('Note text');

    await title.fill('Fast mobile capture');
    await title.press('Enter');
    await expect(body).toBeFocused();
    await body.fill('The keyboard flow should stay inside capture.');
    await composer.getByRole('button', { name: 'Close' }).click();

    await expect(trigger).toBeFocused();
    await expect(page.getByRole('button', { name: 'Open note: Fast mobile capture' })).toBeVisible();
  });

  test('mobile editor keeps its footer and bottom-sheet actions reachable after long content scrolls', async ({
    page,
  }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      const dbModule = await import('/notes/src/db/index.ts');
      const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
      await repository.create({
        title: 'Long mobile editor',
        content: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join('\n'),
      });
    });
    await page.reload();

    await page.getByRole('button', { name: 'Open note: Long mobile editor' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await editor.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const more = editor.getByRole('button', { name: 'More', exact: true });
    const close = editor.getByRole('button', { name: 'Close', exact: true });
    await expect(more).toBeVisible();
    await expect(close).toBeVisible();

    await more.click();
    const connections = editor.getByRole('menuitem', { name: 'Connections' });
    await expect(connections).toBeVisible();
    const menuItemHeight = await connections.evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    expect(menuItemHeight).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await close.click();
  });

  test('checklist title Enter advances directly to the first list item', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Create a checklist' }).click();

    const composer = page.getByRole('form', { name: 'New checklist' });
    const title = composer.getByLabel('Checklist title');
    const firstItem = composer.getByLabel('Checklist item 1');

    await title.fill('Mobile checklist');
    await title.press('Enter');
    await expect(firstItem).toBeFocused();
    await firstItem.fill('First task');
    await composer.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByRole('button', { name: 'Open note: Mobile checklist' })).toBeVisible();
  });
});
'''
)
