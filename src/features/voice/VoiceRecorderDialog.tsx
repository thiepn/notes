import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CircleStop, Mic, Pause, Play, RotateCcw, Save, Trash2, X } from 'lucide-react';

import {
  createVoiceRecordingFile,
  formatVoiceDuration,
  MAX_VOICE_RECORDING_MS,
  selectVoiceRecordingMimeType,
  voiceCaptureErrorMessage,
} from './voiceRecording';

type RecorderPhase = 'requesting' | 'recording' | 'paused' | 'review' | 'saving' | 'error';

interface VoiceRecorderDialogProps {
  onSave(file: File): Promise<void> | void;
  onClose(): void;
}

export function VoiceRecorderDialog({ onSave, onClose }: VoiceRecorderDialogProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  const recorderFailedRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>('requesting');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const currentElapsed = useCallback(() => {
    const startedAt = startedAtRef.current;
    return Math.min(
      MAX_VOICE_RECORDING_MS,
      accumulatedMsRef.current + (startedAt === null ? 0 : performance.now() - startedAt),
    );
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setElapsedMs(Math.min(MAX_VOICE_RECORDING_MS, accumulatedMsRef.current));
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    clearPreview();
    setPhase('requesting');
    setErrorMessage(null);
    setRecordingBlob(null);
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    recorderFailedRef.current = false;

    try {
      if (!window.isSecureContext) {
        throw new Error('Voice recording requires a secure HTTPS connection.');
      }
      const MediaRecorderClass = window.MediaRecorder;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorderClass === 'undefined') {
        throw new Error('Voice recording is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!mountedRef.current || closingRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;

      const preferredMimeType = selectVoiceRecordingMimeType((mimeType) =>
        MediaRecorderClass.isTypeSupported(mimeType),
      );
      const recorder = preferredMimeType
        ? new MediaRecorderClass(stream, { mimeType: preferredMimeType })
        : new MediaRecorderClass(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const mimeType = recorder.mimeType || preferredMimeType || chunksRef.current[0]?.type || '';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recorderRef.current = null;
        stopStream();
        if (!mountedRef.current || closingRef.current || recorderFailedRef.current) return;
        if (blob.size === 0) {
          setPhase('error');
          setErrorMessage('The microphone did not produce any audio.');
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setRecordingBlob(blob);
        setPhase('review');
      });
      recorder.addEventListener('error', () => {
        recorderFailedRef.current = true;
        recorderRef.current = null;
        stopStream();
        if (!mountedRef.current || closingRef.current) return;
        setPhase('error');
        setErrorMessage('The browser stopped the voice recording unexpectedly.');
      });

      recorder.start(1_000);
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      setPhase('recording');
    } catch (error) {
      stopStream();
      if (!mountedRef.current || closingRef.current) return;
      setPhase('error');
      setErrorMessage(voiceCaptureErrorMessage(error));
    }
  }, [clearPreview, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    closingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const startTimer = window.setTimeout(() => void startRecording(), 0);
    return () => {
      window.clearTimeout(startTimer);
      mountedRef.current = false;
      closingRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      document.body.style.overflow = previousOverflow;
    };
  }, [startRecording, stopStream]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const update = () => {
      const next = currentElapsed();
      setElapsedMs(next);
      if (next >= MAX_VOICE_RECORDING_MS) stopRecording();
    };
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [currentElapsed, phase, stopRecording]);

  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setElapsedMs(accumulatedMsRef.current);
    setPhase('paused');
  };

  const resume = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    startedAtRef.current = performance.now();
    setPhase('recording');
  };

  const close = () => {
    if (phase === 'saving') return;
    closingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopStream();
    onClose();
  };

  const retry = () => {
    closingRef.current = false;
    void startRecording();
  };

  const save = async () => {
    if (!recordingBlob || phase === 'saving') return;
    setPhase('saving');
    setErrorMessage(null);
    try {
      await onSave(createVoiceRecordingFile(recordingBlob));
      closingRef.current = true;
      onClose();
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('review');
      setErrorMessage(
        error instanceof Error ? error.message : 'The voice recording could not be saved.',
      );
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape' && phase !== 'saving') {
      event.preventDefault();
      close();
    }
  };

  return (
    <div
      className="voice-dialog-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Voice recorder"
      onKeyDownCapture={handleKeyDown}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="voice-dialog">
        <header className="voice-dialog-header">
          <div>
            <strong>Voice recording</strong>
            <span>Stored only in this Notes library</span>
          </div>
          <button
            type="button"
            aria-label="Close voice recorder"
            disabled={phase === 'saving'}
            onClick={close}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="voice-dialog-body">
          {phase === 'requesting' ? (
            <div className="voice-recorder-state" aria-live="polite">
              <span className="voice-recorder-icon" data-state="requesting">
                <Mic aria-hidden="true" />
              </span>
              <strong>Requesting microphone…</strong>
              <span>Use the browser permission prompt to allow recording.</span>
            </div>
          ) : null}

          {phase === 'recording' || phase === 'paused' ? (
            <div className="voice-recorder-state" aria-live="polite">
              <span className="voice-recorder-icon" data-state={phase}>
                <Mic aria-hidden="true" />
              </span>
              <strong>{phase === 'recording' ? 'Recording' : 'Paused'}</strong>
              <span
                className="voice-recorder-timer"
                aria-label={`Recording time ${formatVoiceDuration(elapsedMs)}`}
              >
                {formatVoiceDuration(elapsedMs)}
              </span>
              <span className="voice-recorder-limit">Maximum recording length: 30 minutes</span>
              <div className="voice-recording-controls">
                {phase === 'recording' ? (
                  <button type="button" onClick={pause}>
                    <Pause aria-hidden="true" /> Pause
                  </button>
                ) : (
                  <button type="button" onClick={resume}>
                    <Play aria-hidden="true" /> Resume
                  </button>
                )}
                <button className="voice-stop-button" type="button" onClick={stopRecording}>
                  <CircleStop aria-hidden="true" /> Stop
                </button>
              </div>
            </div>
          ) : null}

          {phase === 'review' || phase === 'saving' ? (
            <div className="voice-review">
              <div>
                <strong>Recording ready</strong>
                <span>{formatVoiceDuration(elapsedMs)}</span>
              </div>
              {previewUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={previewUrl}
                  aria-label="Voice recording preview"
                />
              ) : null}
              {errorMessage ? (
                <span className="voice-error" role="alert">
                  {errorMessage}
                </span>
              ) : null}
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="voice-recorder-state" aria-live="assertive">
              <span className="voice-recorder-icon" data-state="error">
                <Mic aria-hidden="true" />
              </span>
              <strong>Microphone unavailable</strong>
              <span className="voice-error" role="alert">
                {errorMessage}
              </span>
              <button className="voice-retry-button" type="button" autoFocus onClick={retry}>
                <RotateCcw aria-hidden="true" /> Try again
              </button>
            </div>
          ) : null}
        </div>

        <footer className="voice-dialog-footer">
          <div aria-live="polite">
            {phase === 'review' ? <span>Listen before saving or record again.</span> : null}
            {phase === 'saving' ? <span>Saving recording…</span> : null}
          </div>
          <div>
            {phase === 'review' ? (
              <button className="voice-discard-button" type="button" onClick={retry}>
                <Trash2 aria-hidden="true" /> Record again
              </button>
            ) : null}
            <button type="button" disabled={phase === 'saving'} onClick={close}>
              Cancel
            </button>
            {phase === 'review' || phase === 'saving' ? (
              <button
                className="voice-save-button"
                type="button"
                disabled={phase === 'saving'}
                onClick={() => void save()}
              >
                <Save aria-hidden="true" /> {phase === 'saving' ? 'Saving…' : 'Save recording'}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
