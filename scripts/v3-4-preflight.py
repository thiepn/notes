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
path.write_text(text)
