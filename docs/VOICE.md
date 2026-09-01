# Voice

V2-5 / P25 adds local voice-note capture to Notes while preserving the existing local-first attachment, backup, lifecycle, and offline architecture.

## Storage model

Voice recordings are stored as ordinary rows in the existing `attachments` table.

V2-5 therefore requires **no database migration** and introduces no voice-specific persistence table.

A dedicated `VoiceAttachmentsRepository` handles audio validation and insertion because native image attachments intentionally pass through image decode/re-encoding and privacy-processing logic that does not apply to audio.

Saved voice recordings inherit the established attachment behavior for:

- IndexedDB persistence,
- per-note attachment count and storage safety limits,
- SHA-256 duplicate detection,
- Archive and Trash lifecycle behavior,
- permanent-delete cleanup,
- full-library backup and restore,
- offline/PWA operation,
- note-card attachment refresh.

No recording is uploaded to a server by Notes.

## Capture surfaces

Voice recording is available from:

- the collapsed new-note quick-action row,
- an expanded new text-note composer,
- an existing text-note editor,
- an existing checklist editor.

Quick voice capture expands text-note capture but does not create a database note merely because the microphone dialog was opened. The note is ensured only when the user saves a completed recording.

Because the existing capture model preserves otherwise-empty notes that contain attachments, a voice recording can be the entire content of a note.

Cancelling or denying microphone access does not create an empty note.

## Browser recording API

V2-5 records through standard browser APIs:

- `navigator.mediaDevices.getUserMedia()` for microphone access,
- `MediaRecorder` for encoding.

Microphone acquisition requests audio only and enables the browser's standard echo-cancellation, noise-suppression, and automatic-gain-control hints when supported.

Recording requires a secure browser context. The production HTTPS PWA satisfies this requirement; browsers also generally treat loopback hosts as trustworthy for development.

## Recording format negotiation

Notes prefers the first browser-supported format from this sequence:

1. `audio/webm;codecs=opus`
2. `audio/webm`
3. `audio/ogg;codecs=opus`
4. `audio/ogg`
5. `audio/mp4;codecs=mp4a.40.2`
6. `audio/mp4`

If none of those explicit candidates is reported as supported, Notes allows `MediaRecorder` to choose its browser default and then validates the resulting MIME type before persistence.

The attachment repository accepts the common browser-recording families:

- WebM
- Ogg
- MP4 / M4A
- MP3
- AAC
- WAV

The actual browser-selected recording format remains authoritative; Notes does not transcode recordings in V2-5.

## Recording session

A recording session supports:

- automatic microphone start after the user invokes Record voice,
- live elapsed time,
- Pause,
- Resume,
- Stop,
- review playback before persistence,
- Record again,
- Cancel,
- Save recording.

The elapsed timer is derived from monotonic browser time rather than timer tick counts so UI scheduling delays do not materially distort the displayed duration.

## Safety limits

V2-5 applies these limits:

- maximum recording session: **30 minutes**,
- maximum saved recording size: **50 MB**,
- maximum attachments per note: the existing **50**,
- maximum total attachment bytes per note: the existing **250 MB**.

A recording that exceeds repository limits is rejected without replacing or corrupting existing attachments.

## Permissions and errors

The voice dialog explicitly handles:

- microphone permission denied,
- no microphone device,
- microphone busy/unreadable,
- unsupported recording APIs,
- insecure context,
- empty recording output,
- unexpected recorder termination,
- persistence/storage failures.

Permission denial remains non-destructive: no note or attachment is created unless a recording reaches the explicit save path.

## Playback

Saved recordings appear in the shared attachment panel as dedicated voice rows with:

- microphone icon,
- filename,
- size,
- native browser audio controls,
- download,
- remove confirmation.

Object URLs are created only for local Blob playback and are revoked when the corresponding UI unmounts or changes.

Audio-only note cards show a compact microphone badge with the number of saved voice recordings. Notes with an image keep the existing image-first card preview, while additional voice recordings continue to count as attachments.

## Modal isolation

Voice recording can be launched from another modal editor. The voice dialog therefore stops its keyboard and pointer events from propagating to the parent editor.

Pressing Escape while Voice is active closes **only the voice recorder**, not the underlying text-note or checklist editor.

Closing the voice dialog stops active microphone tracks.

## Privacy

V2-5 is deliberately local-only:

- no cloud transcription,
- no server audio upload,
- no remote speech processing,
- no account requirement,
- no background synchronization requirement.

The raw encoded recording produced by the browser is stored locally as an attachment. Unlike images, audio is not transcoded or metadata-rewritten in V2-5 because doing so reliably would require a substantially heavier audio-processing pipeline.

## Phase boundary

V2-5 deliberately excludes:

- speech-to-text or transcription,
- AI summarization of recordings,
- cloud speech services,
- waveform editing,
- trimming or audio effects,
- recording-device selection UI,
- background recording after the Notes page/PWA is closed,
- collaborative audio comments,
- a separate voice-note database schema.

OCR remains a separate later phase and does not imply audio transcription.

## Regression requirements

A V2-5 release must prove that:

- the recorder can enter recording state,
- Pause and Resume work,
- Stop produces a reviewable local recording,
- review playback is exposed before save,
- Save persists a non-empty supported audio Blob,
- quick voice capture creates a note only after save,
- a voice-only note survives composer close,
- text notes can receive recordings,
- checklist notes can receive recordings,
- saved recordings render with inline playback,
- audio-only cards expose the voice-recording count,
- Escape closes only the voice dialog when launched from another editor,
- microphone denial creates no phantom note or attachment,
- existing attachment lifecycle and backup behavior remain intact,
- the complete Chromium regression suite remains green,
- production PWA/offline certification remains green.
