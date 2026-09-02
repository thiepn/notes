from pathlib import Path

path = Path('README.md')
text = path.read_text()

old_status = """**V3.3 — Organization & Navigation Polish is implemented as the third V3 refinement release.** Notes now adds live derived collection and label counts, faster sidebar label finding, count-aware workspace headings, and direct command-palette label navigation without changing the data model.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 polishes retrieval and search, and V3.3 polishes organization and navigation.
"""
new_status = """**V3.4 — Editor & Note Interaction Polish is implemented as the fourth V3 refinement release.** Existing text-note and checklist editors now expose persistence-backed autosave state, last-saved time, useful content metrics, and a discoverable Ctrl/Cmd+Enter close shortcut without changing stored note semantics or recovery behavior.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, and V3.4 existing-note editing feedback and ergonomics.
"""
if old_status in text:
    text = text.replace(old_status, new_status, 1)
elif new_status not in text:
    raise SystemExit('README status marker changed')

section = """## V3.4 scope

V3.4 improves existing-note editor feedback without changing the underlying persistence model:

- Visible **Waiting to save…**, **Saving…**, **Saved**, and **Save failed** states tied to the actual serialized persistence path
- Last successfully persisted update time shown from the saved record's `updatedAt`
- Formatting-neutral visible word and character metrics for text notes
- Meaningful-item and completion metrics for checklists
- Shared editor status presentation across text and checklist editors
- Existing retry behavior retained when persistence fails
- Discoverable Ctrl/Cmd+Enter close-and-save affordance with `aria-keyshortcuts` and tooltip metadata
- Larger-screen shortcut hint while keeping the mobile footer compact
- Recovery-journal drafts settling through the same persistence-backed save-state model after reload

V3.4 requires **no database migration**. The 180 ms autosave delay, serialized save chains, optimistic revisions, recovery journals, revision-history checkpoints, normalized checklist rows, attachments, reminders, backup/restore formats, and offline/PWA behavior remain unchanged.

Metrics and save-feedback state are transient UI state. V3.4 deliberately excludes a new editor framework, document statistics persistence, manual-save mode, new revision semantics, alternate storage formats, and changes to crash-recovery authority.

"""
marker = '## Architecture\n'
if '## V3.4 scope\n' not in text:
    if marker not in text:
        raise SystemExit('README Architecture marker changed')
    text = text.replace(marker, section + marker, 1)

docs_marker = 'See [`docs/PRIVACY.md`](docs/PRIVACY.md)'
editor_line = 'See [`docs/EDITOR_INTERACTION.md`](docs/EDITOR_INTERACTION.md) for V3.4 autosave feedback, editor metrics, keyboard-close affordances, and the persistence/recovery boundary.\n\n'
if editor_line not in text:
    if docs_marker not in text:
        raise SystemExit('README docs marker changed')
    text = text.replace(docs_marker, editor_line + docs_marker, 1)

path.write_text(text)
