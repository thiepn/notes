import { useEffect, useState } from 'react';
import { NotebookPen, X } from 'lucide-react';

import { notesDatabase } from '../../db';

const QUICKSTART_KEY = 'notes.onboarding.quickstart.v1';
const SHOW_DELAY_MS = 900;

export function FirstRunCoach() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    if (quickstartCompleted()) return;

    void notesDatabase.notes
      .count()
      .then((count) => {
        if (cancelled) return;
        if (count !== 0) {
          completeQuickstart();
          return;
        }
        timer = window.setTimeout(() => {
          void notesDatabase.notes
            .count()
            .then((freshCount) => {
              if (
                cancelled ||
                freshCount !== 0 ||
                quickstartCompleted() ||
                document.querySelector('.note-composer, [role="dialog"]')
              ) {
                return;
              }
              setVisible(true);
            })
            .catch(() => undefined);
        }, SHOW_DELAY_MS);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    completeQuickstart();
    setVisible(false);
  };

  const createFirstNote = () => {
    dismiss();
    void clickCreateNoteWhenReady();
  };

  return (
    <aside className="first-run-coach" aria-label="Getting started with Notes">
      <button
        className="first-run-coach-dismiss"
        type="button"
        aria-label="Dismiss getting started"
        onClick={dismiss}
      >
        <X aria-hidden="true" />
      </button>
      <span className="first-run-coach-icon" aria-hidden="true">
        <NotebookPen />
      </span>
      <div className="first-run-coach-copy">
        <strong>Start with one note</strong>
        <p>
          Write first and organize later. Press <kbd>/</kbd> to search or <kbd>Ctrl/⌘ K</kbd> for
          commands.
        </p>
      </div>
      <button className="first-run-coach-primary" type="button" onClick={createFirstNote}>
        Create a note
      </button>
    </aside>
  );
}

function quickstartCompleted(): boolean {
  try {
    return window.localStorage.getItem(QUICKSTART_KEY) === 'done';
  } catch {
    return true;
  }
}

function completeQuickstart(): void {
  try {
    window.localStorage.setItem(QUICKSTART_KEY, 'done');
  } catch {
    // The coach remains dismissible for the current page even when storage is unavailable.
  }
}

async function clickCreateNoteWhenReady(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Create a text note"]',
    );
    if (button) {
      button.click();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}
