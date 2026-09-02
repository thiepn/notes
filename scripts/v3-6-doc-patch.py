from pathlib import Path

path = Path('README.md')
text = path.read_text()
old = '''**V3.5 — Reminders & Time UX Polish is implemented as the fifth V3 refinement release.** Existing local reminders now schedule faster, snooze more flexibly, communicate overdue state clearly, and group upcoming reminders into more useful local-calendar buckets without changing the reminder schema or notification architecture.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, and V3.5 reminder/time interaction quality.
'''
new = '''**V3.6 — Attachments & Media Interaction Polish is implemented as the sixth V3 refinement release.** Existing local image, voice, and imported-file attachments now expose clearer size/type context, richer image viewing, direct image download, and browser-derived media metadata without changing attachment records or Blob storage.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, V3.5 reminder/time interaction quality, and V3.6 attachment/media interaction clarity.
'''
if old in text:
    text = text.replace(old, new, 1)
elif '**V3.6 — Attachments & Media Interaction Polish' not in text:
    raise SystemExit('README V3.5 status block changed.')

marker = '## Architecture\n'
section = '''## V3.6 scope

V3.6 refines the existing attachment experience without adding another media persistence model:

- Attachment-panel count plus total byte size
- Mixed-media breakdown across images, voice recordings, and other files
- Image-tile filename, friendly type, byte size, and direct download action
- Lightbox filename, decoded pixel dimensions, friendly type, and byte size
- Voice-recording duration when native browser metadata is finite and available
- Friendly common file labels such as PDF document, Text document, MP3 audio, or PNG image
- Existing image lightbox keyboard navigation, removal confirmation, downloads, capture sources, privacy processing, and offline behavior preserved

V3.6 requires **no database migration**. Width, height, duration, friendly type labels, totals, and media breakdowns are derived in memory from existing attachment records and local browser decoders; none are written back to IndexedDB.

V3.6 deliberately excludes cloud media hosting, server processing, transcoding, waveform/image editing, attachment-folder/order persistence, EXIF/location display, and persistent media-dimension/duration columns.

See [`docs/ATTACHMENTS_MEDIA.md`](docs/ATTACHMENTS_MEDIA.md) for the V3.6 interaction and persistence contract.

'''
if '## V3.6 scope' not in text:
    if marker not in text:
        raise SystemExit('README Architecture marker changed.')
    text = text.replace(marker, section + marker, 1)

path.write_text(text)
