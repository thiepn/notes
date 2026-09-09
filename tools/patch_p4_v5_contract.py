from pathlib import Path

path = Path('e2e/v5-redesign.spec.ts')
text = path.read_text()
old = """  await drawer.getByRole('button', { name: 'Hide navigation' }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const form = page.getByRole('form', { name: 'New note' });
"""
new = """  await drawer.getByRole('button', { name: 'Hide navigation' }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const captureMenu = page.getByRole('dialog', { name: 'New', exact: true });
  await captureMenu.getByRole('button', { name: /^Text note/ }).click();
  const form = page.getByRole('form', { name: 'New note' });
"""
assert text.count(old) == 1, 'Canonical mobile capture block not found exactly once.'
path.write_text(text.replace(old, new, 1))
