from pathlib import Path

path = Path('tools/apply_p4_notes.py')
text = path.read_text()
old = '''replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    \"\"\"        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
    \"\"\"        <IconButton\n          className=\\\"bulk-selection-icon\\\"\n          label=\\\"Export selected notes as Markdown\\\"\n          onClick={onExport}\n        >\n          <Download />\n        </IconButton>\n\n        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
)
'''
new = '''replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    \"\"\"      <div className=\\\"bulk-selection-actions\\\">\n        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
    \"\"\"      <div className=\\\"bulk-selection-actions\\\">\n        <IconButton\n          className=\\\"bulk-selection-icon\\\"\n          label=\\\"Export selected notes as Markdown\\\"\n          onClick={onExport}\n        >\n          <Download />\n        </IconButton>\n\n        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
)
'''
if old not in text:
    raise RuntimeError('Expected ambiguous bulk export patch block was not found.')
path.write_text(text.replace(old, new, 1))
