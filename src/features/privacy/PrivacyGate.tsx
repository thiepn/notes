import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole, StickyNote } from 'lucide-react';

import { notesDocumentTitle } from '../../app/documentContext';
import { usePrivacy } from './PrivacyContext';
import { readPrivacyAttemptState } from './privacy';

export function PrivacyGate({ children }: { children: ReactNode }) {
  const { locked, unlock, unlockBlockedUntil } = usePrivacy();
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const wasBlockedRef = useRef(false);

  const blockedForMs = locked ? Math.max(0, (unlockBlockedUntil ?? 0) - now) : 0;
  const blocked = blockedForMs > 0;
  const blockedSeconds = Math.max(1, Math.ceil(blockedForMs / 1000));

  useEffect(() => {
    if (!locked) return;
    document.title = notesDocumentTitle('Locked');
  }, [locked]);

  useEffect(() => {
    if (!locked || unlockBlockedUntil === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [locked, unlockBlockedUntil]);

  useEffect(() => {
    if (!locked || checking || (!blocked && !errorMessage)) return;
    const frame = window.requestAnimationFrame(() =>
      feedbackRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [blocked, checking, errorMessage, locked]);

  useEffect(() => {
    const wasBlocked = wasBlockedRef.current;
    wasBlockedRef.current = blocked;
    if (!locked || !wasBlocked || blocked) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [blocked, locked]);

  if (!locked) return children;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || blocked || !passcode) return;
    setChecking(true);
    setErrorMessage(null);
    try {
      const valid = await unlock(passcode);
      if (!valid) {
        setPasscode('');
        const attempt = readPrivacyAttemptState();
        const nextNow = Date.now();
        setNow(nextNow);
        setErrorMessage(
          attempt && attempt.blockedUntil > nextNow ? null : 'Incorrect passcode.',
        );
        return;
      }
      setPasscode('');
    } finally {
      setChecking(false);
      setNow(Date.now());
    }
  };

  return (
    <main className="privacy-lock-screen" aria-labelledby="privacy-lock-title">
      <section className="privacy-lock-card">
        <span className="privacy-lock-brand" aria-hidden="true">
          <StickyNote />
        </span>
        <span className="privacy-lock-icon" aria-hidden="true">
          <LockKeyhole />
        </span>
        <h1 id="privacy-lock-title">Notes is locked</h1>
        <p>Enter the device-local privacy passcode to show your notes.</p>
        <form onSubmit={(event) => void submit(event)} aria-busy={checking || undefined}>
          <label>
            <span>Passcode</span>
            <input
              ref={inputRef}
              autoFocus
              type="password"
              autoComplete="current-password"
              value={passcode}
              disabled={blocked || checking}
              aria-invalid={errorMessage ? 'true' : undefined}
              onChange={(event) => setPasscode(event.target.value)}
            />
          </label>
          {blocked ? (
            <p ref={feedbackRef} className="privacy-error" role="status" tabIndex={-1}>
              Too many attempts. Try again in {blockedSeconds}{' '}
              {blockedSeconds === 1 ? 'second' : 'seconds'}.
            </p>
          ) : errorMessage ? (
            <p ref={feedbackRef} className="privacy-error" role="alert" tabIndex={-1}>
              {errorMessage}
            </p>
          ) : null}
          <button type="submit" disabled={!passcode || checking || blocked}>
            {checking ? 'Checking…' : blocked ? 'Temporarily locked' : 'Unlock'}
          </button>
        </form>
        <p className="privacy-lock-disclaimer">
          Privacy lock hides the Notes interface on this device. It does not encrypt the IndexedDB
          data stored by your browser.
        </p>
      </section>
    </main>
  );
}
