export const MAX_VOICE_RECORDING_MS = 30 * 60 * 1_000;

export const VOICE_RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const;

export function selectVoiceRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return VOICE_RECORDING_MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType)) ?? null;
}

export function createVoiceRecordingFile(blob: Blob, timestamp = Date.now()): File {
  const mimeType = blob.type.trim().toLocaleLowerCase();
  const extension = voiceRecordingExtension(mimeType);
  const date = new Date(timestamp).toISOString().replace(/[:.]/gu, '-');
  return new File([blob], `voice-${date}.${extension}`, {
    type: mimeType,
    lastModified: timestamp,
  });
}

export function voiceRecordingExtension(mimeType: string): string {
  const base = mimeType.trim().toLocaleLowerCase().split(';', 1)[0] ?? '';
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mpeg') return 'mp3';
  if (base === 'audio/aac') return 'aac';
  if (base === 'audio/wav' || base === 'audio/x-wav') return 'wav';
  return 'm4a';
}

export function formatVoiceDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function voiceCaptureErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone access was blocked. Allow microphone permission for Notes and try again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone is available on this device.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The microphone is busy or could not be opened.';
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Voice recording could not start on this browser.';
}
