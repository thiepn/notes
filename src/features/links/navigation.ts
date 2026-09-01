export const OPEN_LINKED_NOTE_EVENT = 'notes-open-linked-note';

export function requestLinkedNoteOpen(noteId: string): void {
  if (!noteId) return;
  window.dispatchEvent(
    new CustomEvent<{ noteId: string }>(OPEN_LINKED_NOTE_EVENT, {
      detail: { noteId },
    }),
  );
}

export function linkedNoteIdFromEvent(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as { noteId?: unknown } | undefined;
  return typeof detail?.noteId === 'string' && detail.noteId ? detail.noteId : null;
}
