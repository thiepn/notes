import type { NoteRecord } from '../../db';

export type QuickOpenNote = Pick<
  NoteRecord,
  'id' | 'title' | 'type' | 'updatedAt' | 'archivedAt' | 'trashedAt'
>;

export interface RankedQuickOpenNote {
  note: QuickOpenNote;
  score: number;
}

const NAVIGATION_WORDS = new Set(['find', 'go', 'open', 'note', 'notes', 'to']);

export function rankQuickOpenNotes(
  notes: QuickOpenNote[],
  query: string,
  limit = 12,
): RankedQuickOpenNote[] {
  const terms = quickOpenTerms(query);
  if (terms.length === 0 || limit <= 0) return [];
  const phrase = terms.join(' ');

  return notes
    .flatMap((note): RankedQuickOpenNote[] => {
      if (note.trashedAt !== null) return [];
      const title = normalizeKnowledgeText(note.title);
      if (!title || !terms.every((term) => title.includes(term))) return [];

      let score = 500;
      if (title === phrase) score = 1_000;
      else if (title.startsWith(phrase)) score = 900;
      else if (title.includes(phrase)) score = 800;
      else if (terms.every((term) => title.split(' ').some((word) => word.startsWith(term)))) {
        score = 700;
      } else {
        score = 600;
      }

      if (note.archivedAt === null) score += 20;
      return [{ note, score }];
    })
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit);
}

export function quickOpenTerms(query: string): string[] {
  const normalized = normalizeKnowledgeText(query);
  if (!normalized) return [];
  const terms = normalized
    .split(' ')
    .filter(Boolean)
    .filter((term) => !NAVIGATION_WORDS.has(term));
  return terms.join('').length >= 2 ? terms : [];
}

export function normalizeKnowledgeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/ß/gu, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
