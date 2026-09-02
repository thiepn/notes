from pathlib import Path

path = Path('src/components/AppHeader.tsx')
text = path.read_text()
text = text.replace(
    "import { useEffect, useRef, useState } from 'react';",
    "import { lazy, Suspense, useEffect, useRef, useState } from 'react';",
    1,
)
text = text.replace(
    "import { PrivacySettingsDialog } from '../features/privacy/PrivacySettingsDialog';\n",
    '',
    1,
)
marker = "const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);\n"
lazy_dialog = """const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);
const PrivacySettingsDialog = lazy(async () => {
  const module = await import('../features/privacy/PrivacySettingsDialog');
  return { default: module.PrivacySettingsDialog };
});
"""
if 'const PrivacySettingsDialog = lazy' not in text:
    if marker not in text:
        raise SystemExit('AppHeader repository marker changed.')
    text = text.replace(marker, lazy_dialog, 1)

old_render = """      {privacyOpen ? <PrivacySettingsDialog onClose={() => setPrivacyOpen(false)} /> : null}
"""
new_render = """      {privacyOpen ? (
        <Suspense fallback={null}>
          <PrivacySettingsDialog onClose={() => setPrivacyOpen(false)} />
        </Suspense>
      ) : null}
"""
if old_render in text:
    text = text.replace(old_render, new_render, 1)
elif new_render not in text:
    raise SystemExit('AppHeader privacy dialog render marker changed.')

path.write_text(text)
