export class NoteNotFoundError extends Error {
  readonly noteId: string;

  constructor(noteId: string) {
    super(`Note ${noteId} was not found.`);
    this.name = 'NoteNotFoundError';
    this.noteId = noteId;
  }
}

export class NoteConflictError extends Error {
  readonly noteId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(noteId: string, expectedRevision: number, actualRevision: number) {
    super(`Note ${noteId} changed from revision ${expectedRevision} to ${actualRevision}.`);
    this.name = 'NoteConflictError';
    this.noteId = noteId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class InvalidNoteStateError extends Error {
  readonly noteId: string;

  constructor(noteId: string, message: string) {
    super(message);
    this.name = 'InvalidNoteStateError';
    this.noteId = noteId;
  }
}
