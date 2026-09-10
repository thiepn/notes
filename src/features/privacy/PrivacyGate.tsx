import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole, StickyNote } from 'lucide-react';

import { notesDocumentTitle } from '../../app/documentContext';
import { usePrivacy } from './PrivacyContext';

export function PrivacyGate({ children }: { children: ReactNode }) {
  const { locked, unlock, unlockBlockedUntil } = usePrivacy();
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!locked) return;
    document.title = notesDocumentTitle('Locked');
  }, [locked]);

  useEffect(() => {
    if (!locked || unlockBlockedUntil === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [locked, unlockBlockedUntil]);

  if (!locked) return children;

  const blockedForMs = Math.max(0, (unlockBlockedUntil ?? 0) - now);
  const blocked = blockedForMs > 0;
  const blockedSeconds = Math.max(1, Math.ceil(blockedForMs / 1000));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || blocked || !passcode) return;
    setChecking(true);
    setErrorMessage(null);
    try {
      const valid = await unlock(passcode);
      if (!valid) {
        setPasscode('');
        setErrorMessage('Incorrect passcode.');
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
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>Passcode</span>
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              value={passcode}
              disabled={blocked}
              onChange={(event) => setPasscode(event.target.value)}
            />
          </label>
          {blocked ? (
            <p className="privacy-error" role="status">
              Too many attempts. Try again in {blockedSeconds}{' '}
              {blockedSeconds === 1 ? 'second' : 'seconds'}.
            </p>
          ) : errorMessage ? (
            <p className="privacy-error" role="alert">
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
