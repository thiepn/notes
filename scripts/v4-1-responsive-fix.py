from pathlib import Path

path = Path('src/styles/visual-system-polish.css')
text = path.read_text()

old_header = """@media (max-width: 767px) {\n  .app-header {\n    gap: 6px;\n"""
new_header = """@media (max-width: 767px) {\n  .app-header {\n    grid-template-columns: auto minmax(0, 1fr) auto;\n    gap: 6px;\n"""
if old_header not in text:
    raise SystemExit('V4.1 mobile header anchor not found')
text = text.replace(old_header, new_header, 1)

old_settings = """  .settings-dialog-header {\n    min-height: 62px;\n  }\n"""
new_settings = """  .settings-dialog {\n    width: 100%;\n    height: 100dvh;\n    border: 0;\n    border-radius: 0;\n  }\n\n  .settings-dialog-header {\n    min-height: 62px;\n  }\n"""
if old_settings not in text:
    raise SystemExit('V4.1 mobile settings anchor not found')
text = text.replace(old_settings, new_settings, 1)

path.write_text(text)
