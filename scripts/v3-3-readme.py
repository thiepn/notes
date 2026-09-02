from pathlib import Path

path = Path('README.md')
text = path.read_text()

old_status = """**V2-8 — Privacy Enhancements is implemented as the eighth V2 feature release.** Notes now adds a device-local privacy lock, shoulder-surfing-safe note-card previews, privacy-safe reminder notifications, automatic lock timing, and explicit recent-search cleanup without changing the IndexedDB storage or backup model.

V1 through P15 remains the stable product foundation. V2-1 adds reminders, V2-2 lightweight formatting, V2-3 note-to-note link intelligence, V2-4 drawing, V2-5 local voice capture, V2-6 local OCR, V2-7 advanced search, and V2-8 device-local privacy controls while preserving the same zero-backend architecture.
"""
new_status = """**V3.3 — Organization & Navigation Polish is implemented as the third V3 refinement release.** Notes now adds live derived collection and label counts, faster sidebar label finding, count-aware workspace headings, and direct command-palette label navigation without changing the data model.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 polishes retrieval and search, and V3.3 polishes organization and navigation.
"""
if old_status in text:
    text = text.replace(old_status, new_status, 1)
elif new_status not in text:
    raise SystemExit('README status marker changed')

section = """## V3.3 scope

V3.3 improves navigation around the existing Notes, Reminders, Archive, Trash, and label model:

- Live sidebar counts for active Notes, active visible Reminders, Archive, and Trash
- Active-note counts beside every label
- Count-aware workspace headings for collections and label views
- Case-insensitive **Find labels** filtering when the expanded sidebar has six or more labels
- Temporary label filtering that clears after navigation rather than becoming hidden persistent state
- Direct command-palette destinations for every current label
- Count context in label command-palette entries
- Live count refresh through normal capture, lifecycle, label, bulk-refresh, restore, and reminder-change paths
- Compact-sidebar behavior that remains icon-first without count or search clutter
- Derived navigation state computed from the existing repositories rather than persisted separately

V3.3 requires **no database migration**. Notes, checklist rows, label relationships, reminders, attachments, revisions, search data, privacy settings, and backups keep their existing authority and formats. Navigation counts are disposable derived UI state and a count-refresh failure cannot block access to stored notes.

V3.3 deliberately excludes folders, nested hierarchy, smart folders, a persistent count/cache table, a second search index, new lifecycle states, and changes to backup/restore semantics.

"""
marker = '## Architecture\n'
if '## V3.3 scope\n' not in text:
    if marker not in text:
        raise SystemExit('README Architecture marker changed')
    text = text.replace(marker, section + marker, 1)

path.write_text(text)
