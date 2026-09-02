from pathlib import Path

path = Path('e2e/attachments-media-polish.spec.ts')
text = path.read_text()
old = """  const totalBytes = seeded.pngSize + seeded.wavSize + 2048;
  const expectedTotal = totalBytes < 1024 ? `${totalBytes} B` : `${(totalBytes / 1024).toFixed(1)} KB`;
"""
new = """  const totalBytes = seeded.pngSize + seeded.wavSize + 2048;
  const kilobytes = totalBytes / 1024;
  const expectedTotal = `${kilobytes.toFixed(kilobytes >= 10 ? 1 : 2)} KB`;
"""
if old in text:
    text = text.replace(old, new, 1)
elif 'kilobytes.toFixed(kilobytes >= 10 ? 1 : 2)' not in text:
    raise SystemExit('V3.6 mixed-media size assertion marker changed.')
path.write_text(text)

path = Path('e2e/attachments.spec.ts')
text = path.read_text()
old = "  await expect(editor.getByText(/text\\/plain/u)).toBeVisible();"
new = "  await expect(editor.getByText(/Text document/u)).toBeVisible();"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('Legacy attachment MIME assertion marker changed.')
path.write_text(text)
