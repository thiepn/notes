from pathlib import Path

path = Path('scripts/v3-4-settings-consolidation.py')
text = path.read_text()
old = '''replace_exact('e2e/privacy.spec.ts', "  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();", "  await privacy.getByRole('button', { name: 'Close settings' }).click();", expected=1)'''
new = '''privacy_text = Path('e2e/privacy.spec.ts').read_text()\nold_close = "  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();"\nif privacy_text.count(old_close) != 2:\n    raise SystemExit(f"Expected 2 privacy close calls, found {privacy_text.count(old_close)}")\nprivacy_text = privacy_text.replace(\n    old_close,\n    "  await privacy.getByRole('button', { name: 'Close settings' }).click();",\n    1,\n)\nPath('e2e/privacy.spec.ts').write_text(privacy_text)'''
if old not in text:
    raise SystemExit('V3.4 privacy migration patch target was not found.')
text = text.replace(old, new, 1)
old_test = "  let settings = await openSettings(page);"
if old_test not in text:
    raise SystemExit('V3.4 settings lint target was not found.')
text = text.replace(old_test, "  const settings = await openSettings(page);", 1)
old_active_section = "  const activeSection = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];"
if old_active_section not in text:
    raise SystemExit('V3.4 settings type target was not found.')
text = text.replace(
    old_active_section,
    "  const activeSection = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!;",
    1,
)
old_z = "  z-index: calc(var(--z-modal) + 20);"
if old_z not in text:
    raise SystemExit('V3.4 settings z-index target was not found.')
text = text.replace(old_z, "  z-index: calc(var(--z-dialog) + 20);", 1)
text += r'''

# Closing the passcode sub-dialog intentionally returns to unified Settings.
privacy_path = Path('e2e/privacy.spec.ts')
privacy_text = privacy_path.read_text()
privacy_return_target = """  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();
  await page.getByRole('button', { name: 'More options' }).click();"""
privacy_return_replacement = """  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();
  const returnedSettings = page.getByRole('dialog', { name: 'Settings' });
  await expect(returnedSettings).toBeVisible();
  await returnedSettings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'More options' }).click();"""
if privacy_text.count(privacy_return_target) != 1:
    raise SystemExit(
        f"Expected one privacy return-to-settings test target, found {privacy_text.count(privacy_return_target)}"
    )
privacy_path.write_text(privacy_text.replace(privacy_return_target, privacy_return_replacement, 1))
'''
path.write_text(text)
