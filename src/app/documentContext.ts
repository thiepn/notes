export function notesDocumentTitle(workspaceTitle: string): string {
  const title = workspaceTitle.trim();
  if (!title || title === 'Notes') return 'Notes';
  return `${title} — Notes`;
}

export function workspaceAnnouncement(workspaceTitle: string): string {
  const title = workspaceTitle.trim() || 'Notes';
  return `${title} workspace`;
}
