from pathlib import Path

path = Path('tools/apply_p4_notes.py')
text = path.read_text()
start_marker = "replace(\n    'src/features/notes/BulkSelectionToolbar.tsx',\n    '''        {mode === 'notes' ? ("
start = text.rfind(start_marker)
end_marker = "\n)\n\nprint('P4 note capture/export patch applied.')"
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('Could not locate the final bulk export replacement block.')
replacement = '''replace(
    'src/features/notes/BulkSelectionToolbar.tsx',
    \"\"\"      <div className=\"bulk-selection-actions\">\n        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
    \"\"\"      <div className=\"bulk-selection-actions\">\n        <IconButton\n          className=\"bulk-selection-icon\"\n          label=\"Export selected notes as Markdown\"\n          onClick={onExport}\n        >\n          <Download />\n        </IconButton>\n\n        {mode === 'notes' ? (\n          <IconButton\n\"\"\",
)'''
path.write_text(text[:start] + replacement + text[end + 2:])
