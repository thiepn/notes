from pathlib import Path

path = Path('src/app/AppShell.tsx')
text = path.read_text()
marker = '  const activeWorkspaceCount =\n'
first = text.find(marker)
second = text.find(marker, first + len(marker)) if first >= 0 else -1
if second >= 0:
    text = text[:first] + text[second:]
path.write_text(text)
