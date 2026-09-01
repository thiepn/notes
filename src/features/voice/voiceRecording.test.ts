import { describe, expect, it } from 'vitest';

import {
  createVoiceRecordingFile,
  formatVoiceDuration,
  selectVoiceRecordingMimeType,
  voiceRecordingExtension,
} from './voiceRecording';

describe('voice recording utilities', () => {
  it('selects the first browser-supported preferred recording format', () => {
    expect(selectVoiceRecordingMimeType((mimeType) => mimeType === 'audio/ogg;codecs=opus')).toBe(
      'audio/ogg;codecs=opus',
    );
  });

  it('returns null when the browser exposes no supported recording format', () => {
    expect(selectVoiceRecordingMimeType(() => false)).toBeNull();
  });

  it('maps codec-bearing mime types to portable filename extensions', () => {
    expect(voiceRecordingExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(voiceRecordingExtension('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
  });

  it('creates deterministic voice filenames while preserving the recorded mime type', () => {
    const file = createVoiceRecordingFile(
      new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      Date.UTC(2026, 8, 1, 12, 34, 56, 789),
    );
    expect(file.name).toBe('voice-2026-09-01T12-34-56-789Z.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
  });

  it('formats short and long recording durations', () => {
    expect(formatVoiceDuration(0)).toBe('0:00');
    expect(formatVoiceDuration(65_900)).toBe('1:05');
    expect(formatVoiceDuration(3_661_000)).toBe('1:01:01');
  });
});
