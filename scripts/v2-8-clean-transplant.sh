#!/usr/bin/env bash
set -euo pipefail

git fetch origin v2-8-privacy-enhancements:refs/remotes/origin/v2-8-privacy-enhancements

git checkout origin/v2-8-privacy-enhancements -- \
  README.md \
  docs/PRIVACY.md \
  e2e/privacy.spec.ts \
  src/App.tsx \
  src/features/privacy \
  src/features/reminders/ReminderNotificationCoordinator.tsx \
  src/styles/privacy.css

python - <<'PY'
from pathlib import Path

path = Path('src/components/AppHeader.tsx')
text = path.read_text()

replacements = [
    ("  List,\n  Menu,\n", "  List,\n  LockKeyhole,\n  Menu,\n"),
    ("  Search,\n  SlidersHorizontal,\n", "  Search,\n  ShieldCheck,\n  SlidersHorizontal,\n"),
    (
        "import { notesDatabase } from '../db';\n",
        "import { notesDatabase } from '../db';\nimport { PrivacySettingsDialog } from '../features/privacy/PrivacySettingsDialog';\nimport { usePrivacy } from '../features/privacy/PrivacyContext';\n",
    ),
    (
        "  const { preference, cyclePreference } = useTheme();\n",
        "  const { preference, cyclePreference } = useTheme();\n  const { lockEnabled, lock } = usePrivacy();\n",
    ),
    (
        "  const [moreOpen, setMoreOpen] = useState(false);\n",
        "  const [moreOpen, setMoreOpen] = useState(false);\n  const [privacyOpen, setPrivacyOpen] = useState(false);\n",
    ),
    (
        "  return (\n    <header className=\"app-header\">\n",
        "  return (\n    <>\n      <header className=\"app-header\">\n",
    ),
]
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'AppHeader transplant marker changed: {old[:60]!r}')
    text = text.replace(old, new, 1)

menu_marker = '''            <button
              type="button"
              role="menuitem"
              onClick={() => {
                cyclePreference();
                setMoreOpen(false);
              }}
            >
              <ThemeIcon aria-hidden="true" />
              <span>{THEME_LABELS[preference]} appearance</span>
              <small>Next: {THEME_LABELS[nextPreference]}</small>
            </button>
'''
menu_addition = menu_marker + '''            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                setPrivacyOpen(true);
              }}
            >
              <ShieldCheck aria-hidden="true" />
              <span>Privacy settings</span>
            </button>
            {lockEnabled ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  lock();
                }}
              >
                <LockKeyhole aria-hidden="true" />
                <span>Lock now</span>
              </button>
            ) : null}
'''
if '<span>Privacy settings</span>' not in text:
    if menu_marker not in text:
        raise SystemExit('AppHeader privacy menu marker changed.')
    text = text.replace(menu_marker, menu_addition, 1)

close_marker = '''      </div>
    </header>
  );
}
'''
close_replacement = '''      </div>
      </header>

      {privacyOpen ? <PrivacySettingsDialog onClose={() => setPrivacyOpen(false)} /> : null}
    </>
  );
}
'''
if '<PrivacySettingsDialog onClose={() => setPrivacyOpen(false)} />' not in text:
    if close_marker not in text:
        raise SystemExit('AppHeader closing marker changed.')
    text = text.replace(close_marker, close_replacement, 1)
path.write_text(text)

path = Path('src/features/notes/NoteCard.tsx')
text = path.read_text()
replacements = [
    ("  Copy,\n  MoreHorizontal,\n", "  Copy,\n  EyeOff,\n  MoreHorizontal,\n"),
    (
        "} from '../../db';\nimport { formatReminderShort } from '../reminders/reminderTime';\n",
        "} from '../../db';\nimport { usePrivacy } from '../privacy/PrivacyContext';\nimport { formatReminderShort } from '../reminders/reminderTime';\n",
    ),
    (
        "}: NoteCardProps) {\n  const cardRef = useRef<HTMLElement>(null);\n",
        "}: NoteCardProps) {\n  const { hidePreviews } = usePrivacy();\n  const cardRef = useRef<HTMLElement>(null);\n",
    ),
    (
        "  const label = noteLabel(note, checklistItems);\n",
        "  const label = hidePreviews ? 'Hidden note' : noteLabel(note, checklistItems);\n",
    ),
    (
        "      data-has-reminder={effectiveReminder !== null}\n",
        "      data-has-reminder={effectiveReminder !== null}\n      data-preview-hidden={hidePreviews}\n",
    ),
    (
        "            attachmentRefreshKey={attachmentRefreshKey}\n            searchContext={searchContext}\n",
        "            attachmentRefreshKey={attachmentRefreshKey}\n            hidePreview={hidePreviews}\n            searchContext={searchContext}\n",
    ),
    (
        "  attachmentRefreshKey,\n  searchContext,\n}: {\n",
        "  attachmentRefreshKey,\n  hidePreview,\n  searchContext,\n}: {\n",
    ),
    (
        "  attachmentRefreshKey: number;\n  searchContext?: string | undefined;\n}) {\n  return (\n",
        "  attachmentRefreshKey: number;\n  hidePreview: boolean;\n  searchContext?: string | undefined;\n}) {\n  if (hidePreview) {\n    return (\n      <span className=\"note-card-private-placeholder\" aria-label=\"Note preview hidden\">\n        <EyeOff aria-hidden=\"true\" />\n        <span>Preview hidden</span>\n      </span>\n    );\n  }\n\n  return (\n",
    ),
]
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'NoteCard transplant marker changed: {old[:60]!r}')
    if 'attachmentRefreshKey={attachmentRefreshKey}' in old:
        text = text.replace(old, new)
    else:
        text = text.replace(old, new, 1)
path.write_text(text)

path = Path('src/styles.css')
text = path.read_text()
privacy_import = "@import './styles/privacy.css';\n"
if privacy_import not in text:
    marker = "@import './styles/pwa.css';\n"
    if marker not in text:
        raise SystemExit('styles.css PWA import marker changed.')
    text = text.replace(marker, privacy_import + marker, 1)
path.write_text(text)
PY

npm install --no-audit --no-fund
npx prettier --write README.md docs/PRIVACY.md e2e/privacy.spec.ts src/App.tsx src/components/AppHeader.tsx src/features/privacy src/features/reminders/ReminderNotificationCoordinator.tsx src/features/notes/NoteCard.tsx src/styles/privacy.css src/styles.css
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add README.md docs/PRIVACY.md e2e/privacy.spec.ts src/App.tsx src/components/AppHeader.tsx src/features/privacy src/features/reminders/ReminderNotificationCoordinator.tsx src/features/notes/NoteCard.tsx src/styles/privacy.css src/styles.css
git commit -m "V2-8: transplant privacy enhancements onto current main"
git push origin HEAD:v2-8-clean-48ac
