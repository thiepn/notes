import { useEffect, useRef, useState } from 'react';

import { usePrivacy } from '../features/privacy/PrivacyContext';
import { createNotesHubSummary } from './notesHubSummary';
import './notesHubBridge.css';

const MESSAGE = 'thiepn:notes-hub-local:v1';
const NONCE = /^[0-9a-f]{32}$/;

function readHubRequest(): string | null {
  try {
    const url = new URL(window.location.href);
    const request = url.searchParams.get('hubNotes');
    if (!request || !NONCE.test(request)) return null;
    url.searchParams.delete('hubNotes');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (
      window.location.origin !== 'https://thiepn.dev' &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)
    )
      return null;
    if (
      !window.opener ||
      window.opener === window ||
      window.opener.location.origin !== window.location.origin ||
      window.opener.location.pathname !== '/'
    )
      return null;
    return request;
  } catch {
    return null;
  }
}

/** This component MUST be mounted inside PrivacyGate. The lock unmounts it. */
export function NotesHubBridge() {
  const { locked } = usePrivacy();
  const [request] = useState(readHubRequest);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!request || locked) return null;

  async function shareOnce() {
    if (!request || busy || sent || locked) return;
    setBusy(true);
    setError('');
    try {
      const snapshot = await createNotesHubSummary();
      if (
        !alive.current ||
        !window.opener ||
        window.opener.closed ||
        window.opener.location.origin !== window.location.origin ||
        window.opener.location.pathname !== '/'
      ) {
        throw new Error('The original Hub window is no longer available.');
      }
      window.opener.postMessage(
        { type: MESSAGE, nonce: request, snapshot },
        window.location.origin,
      );
      setSent(true);
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : 'Could not create the Notes summary.');
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="notes-hub-backdrop">
      <section
        className="notes-hub-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-hub-title"
      >
        <p className="notes-hub-eyebrow">Notes → THIEPN Hub</p>
        <h1 id="notes-hub-title">Share your Notes overview?</h1>
        <p>
          Share the titles and update times of up to eight active notes, six active reminders, and
          the total active-note count with the Hub tab that opened this window.
        </p>
        <p>
          <strong>Never shared:</strong> note bodies, checklist text, attachments, labels, archived
          or trashed note titles, private search queries, cloud data or credentials.
        </p>
        <p>
          This is one approval for this browser tab only. Notes remains the owner, and nothing is
          stored or automatically synchronized by this handoff.
        </p>
        {error && (
          <p role="alert" className="notes-hub-error">
            {error}
          </p>
        )}
        {sent ? (
          <p role="status">Summary shared. Return to Hub or close this tab.</p>
        ) : (
          <div className="notes-hub-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void shareOnce();
              }}
            >
              {busy ? 'Reading Notes…' : 'Share once'}
            </button>
            <button type="button" className="notes-hub-cancel" onClick={() => window.close()}>
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
