import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Eye, EyeOff, LockKeyhole, StickyNote } from 'lucide-react';

import { usePrivacy } from './PrivacyContext';

export function PrivacyGate({ children }: { children: ReactNode }) {
  const { locked, unlock } = usePrivacy();
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  if (!locked) return children;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || !passcode) return;
    setChecking(true);
    setErrorMessage(null);
    try {
      const valid = await unlock(passcode);
      if (!valid) {
        setPasscode('');
        setShowPasscode(false);
        setErrorMessage('Incorrect passcode. Try again.');
        return;
      }
      setPasscode('');
      setShowPasscode(false);
      setCapsLock(false);
    } finally {
      setChecking(false);
    }
  };

  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState('CapsLock'));
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
            <span className="privacy-lock-passcode-field">
              <input
                autoFocus
                type={showPasscode ? 'text' : 'password'}
                autoComplete="current-password"
                value={passcode}
                aria-describedby={capsLock ? 'privacy-caps-lock-warning' : undefined}
                onChange={(event) => setPasscode(event.target.value)}
                onKeyDown={updateCapsLock}
                onKeyUp={updateCapsLock}
                onBlur={() => setCapsLock(false)}
              />
              <button
                type="button"
                className="privacy-passcode-visibility"
                aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                aria-pressed={showPasscode}
                onClick={() => setShowPasscode((visible) => !visible)}
              >
                {showPasscode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </span>
          </label>
          {capsLock ? (
            <p id="privacy-caps-lock-warning" className="privacy-caps-lock" role="status">
              Caps Lock is on.
            </p>
          ) : null}
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
