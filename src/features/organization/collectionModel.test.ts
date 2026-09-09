import { describe, expect, it } from 'vitest';

import {
  isSearchableNote,
  matchesOrganizationSearchStatus,
  noteLifecycle,
  organizationCollectionKey,
  organizationCollectionLabelId,
  organizationCollectionMode,
  resolveOrganizationCollection,
} from './collectionModel';

const active = { archivedAt: null, trashedAt: null, pinnedAt: null };
const pinned = { archivedAt: null, trashedAt: null, pinnedAt: 20 };
const archived = { archivedAt: 30, trashedAt: null, pinnedAt: null };
const trashed = { archivedAt: null, trashedAt: 40, pinnedAt: null };

describe('organization collection model', () => {
  it('classifies note lifecycle with trash taking precedence', () => {
    expect(noteLifecycle(active)).toBe('notes');
    expect(noteLifecycle(archived)).toBe('archive');
    expect(noteLifecycle(trashed)).toBe('trash');
    expect(noteLifecycle({ archivedAt: 30, trashedAt: 40 })).toBe('trash');
  });

  it('keeps global search limited to active and archived notes', () => {
    expect(isSearchableNote(active)).toBe(true);
    expect(isSearchableNote(archived)).toBe(true);
    expect(isSearchableNote(trashed)).toBe(false);
    expect(matchesOrganizationSearchStatus(active, 'any')).toBe(true);
    expect(matchesOrganizationSearchStatus(archived, 'any')).toBe(true);
    expect(matchesOrganizationSearchStatus(trashed, 'any')).toBe(false);
    expect(matchesOrganizationSearchStatus(active, 'active')).toBe(true);
    expect(matchesOrganizationSearchStatus(archived, 'archived')).toBe(true);
    expect(matchesOrganizationSearchStatus(pinned, 'pinned')).toBe(true);
    expect(matchesOrganizationSearchStatus(archived, 'pinned')).toBe(false);
  });

  it('resolves the shell destination into one organization collection', () => {
    const label = resolveOrganizationCollection('notes', 'label-1');
    expect(label).toEqual({ kind: 'label', labelId: 'label-1' });
    expect(label && organizationCollectionMode(label)).toBe('notes');
    expect(label && organizationCollectionLabelId(label)).toBe('label-1');
    expect(label && organizationCollectionKey(label)).toBe('label:label-1');

    expect(resolveOrganizationCollection('notes', null)).toEqual({ kind: 'notes' });
    expect(resolveOrganizationCollection('archive', 'ignored')).toEqual({ kind: 'archive' });
    expect(resolveOrganizationCollection('trash', null)).toEqual({ kind: 'trash' });
    expect(resolveOrganizationCollection('reminders', null)).toBeNull();
    expect(resolveOrganizationCollection('backup', null)).toBeNull();
  });
});
