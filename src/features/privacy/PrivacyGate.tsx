import { useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole, StickyNote } from 'lucide-react';

import { usePrivacy } from './PrivacyContext';

export function PrivacyGate({ children }: { children: ReactNode }) {
  const { locked, unlock } = usePrivacy();
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!locked) return children;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || !passcode) return;
    setChecking(true);
    setErrorMessage(null);
    try {
      const valid = await unlock(passcode);
      if (!valid) {
        setErrorMessage('Incorrect passcode.');
        return;
      }
      setPasscode('');
    } finally {
      setChecking(false);
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
              onChange={(event) => setPasscode(event.target.value)}
            />
          </label>
          {errorMessage ? (
            <p className="privacy-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button type="submit" disabled={!passcode || checking}>
            {checking ? 'Checking…' : 'Unlock'}
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
