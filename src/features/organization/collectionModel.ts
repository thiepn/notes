import type { NoteRecord } from '../../db';

export type OrganizationLifecycle = 'notes' | 'archive' | 'trash';
export type OrganizationSearchStatus = 'any' | 'active' | 'pinned' | 'archived';

export type OrganizationCollection =
  { kind: 'notes' } | { kind: 'label'; labelId: string } | { kind: 'archive' } | { kind: 'trash' };

type LifecycleNote = Pick<NoteRecord, 'archivedAt' | 'trashedAt' | 'pinnedAt'>;

export function noteLifecycle(
  note: Pick<LifecycleNote, 'archivedAt' | 'trashedAt'>,
): OrganizationLifecycle {
  if (note.trashedAt !== null) return 'trash';
  return note.archivedAt !== null ? 'archive' : 'notes';
}

export function isSearchableNote(note: Pick<LifecycleNote, 'trashedAt'>): boolean {
  return note.trashedAt === null;
}

export function matchesOrganizationSearchStatus(
  note: LifecycleNote,
  status: OrganizationSearchStatus,
): boolean {
  if (!isSearchableNote(note)) return false;
  if (status === 'any') return true;

  const lifecycle = noteLifecycle(note);
  if (status === 'active') return lifecycle === 'notes';
  if (status === 'archived') return lifecycle === 'archive';
  return lifecycle === 'notes' && note.pinnedAt !== null;
}

export function resolveOrganizationCollection(
  section: string,
  activeLabelId: string | null,
): OrganizationCollection | null {
  if (section === 'notes' && activeLabelId) return { kind: 'label', labelId: activeLabelId };
  if (section === 'notes') return { kind: 'notes' };
  if (section === 'archive') return { kind: 'archive' };
  if (section === 'trash') return { kind: 'trash' };
  return null;
}

export function organizationCollectionMode(
  collection: OrganizationCollection,
): OrganizationLifecycle {
  return collection.kind === 'label' ? 'notes' : collection.kind;
}

export function organizationCollectionLabelId(collection: OrganizationCollection): string | null {
  return collection.kind === 'label' ? collection.labelId : null;
}

export function organizationCollectionKey(collection: OrganizationCollection): string {
  return collection.kind === 'label' ? `label:${collection.labelId}` : collection.kind;
}
