import { describe, expect, it } from 'vitest';

import { notesDocumentTitle, workspaceAnnouncement } from './documentContext';

describe('document context helpers', () => {
  it('keeps the primary Notes title compact and qualifies secondary workspaces', () => {
    expect(notesDocumentTitle('Notes')).toBe('Notes');
    expect(notesDocumentTitle(' Archive ')).toBe('Archive — Notes');
    expect(notesDocumentTitle('')).toBe('Notes');
  });

  it('produces concise workspace announcements for assistive technology', () => {
    expect(workspaceAnnouncement('Search')).toBe('Search workspace');
    expect(workspaceAnnouncement('  Missions  ')).toBe('Missions workspace');
    expect(workspaceAnnouncement('')).toBe('Notes workspace');
  });
});
