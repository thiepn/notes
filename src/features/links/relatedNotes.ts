import type { NoteRecord } from '../../db';

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const NUMBER_PATTERN = /^\p{N}+$/u;
const MAX_TERMS_PER_NOTE = 600;
const DEFAULT_LIMIT = 5;
const MIN_RELATED_SCORE = 0.16;

const STOP_WORDS = new Set([
  'and',
  'are',
  'but',
  'for',
  'from',
  'has',
  'have',
  'into',
  'not',
  'that',
  'the',
  'their',
  'then',
  'this',
  'was',
  'were',
  'with',
  'you',
  'your',
  'aber',
  'das',
  'der',
  'die',
  'ein',
  'eine',
  'für',
  'ist',
  'mit',
  'nicht',
  'und',
  'von',
  'aux',
  'avec',
  'dans',
  'des',
  'est',
  'les',
  'mais',
  'pas',
  'pour',
  'que',
  'une',
  'bir',
  'bu',
  'için',
  'ile',
  'ama',
  've',
]);

export interface RelatedNote {
  note: NoteRecord;
  score: number;
  duplicate: boolean;
  sharedTerms: string[];
}

interface NoteFingerprint {
  terms: Map<string, number>;
  totalWeight: number;
  canonicalDocument: string;
}

export function findRelatedNotes(
  source: NoteRecord,
  library: NoteRecord[],
  limit = DEFAULT_LIMIT,
): RelatedNote[] {
  if (limit <= 0) return [];

  const sourceFingerprint = fingerprint(source);
  if (sourceFingerprint.totalWeight === 0) return [];

  return library
    .filter((candidate) => candidate.id !== source.id && candidate.trashedAt === null)
    .map((candidate) => compare(sourceFingerprint, candidate))
    .filter((candidate): candidate is RelatedNote => candidate !== null)
    .sort(
      (left, right) =>
        Number(right.duplicate) - Number(left.duplicate) ||
        right.score - left.score ||
        right.note.updatedAt - left.note.updatedAt ||
        left.note.id.localeCompare(right.note.id),
    )
    .slice(0, limit);
}

function compare(source: NoteFingerprint, candidate: NoteRecord): RelatedNote | null {
  const target = fingerprint(candidate);
  if (target.totalWeight === 0) return null;

  let intersection = 0;
  const shared: Array<{ term: string; weight: number }> = [];

  for (const [term, sourceWeight] of source.terms) {
    const targetWeight = target.terms.get(term);
    if (targetWeight === undefined) continue;
    const sharedWeight = Math.min(sourceWeight, targetWeight);
    intersection += sharedWeight;
    shared.push({ term, weight: sharedWeight });
  }

  if (intersection === 0) return null;

  const union = source.totalWeight + target.totalWeight - intersection;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(source.totalWeight, target.totalWeight);
  const score = 0.7 * jaccard + 0.3 * containment;
  const exactDuplicate =
    source.canonicalDocument.length > 1 && source.canonicalDocument === target.canonicalDocument;
  const nearDuplicate = score >= 0.82 && containment >= 0.9;
  const duplicate = exactDuplicate || nearDuplicate;

  if (!duplicate && score < MIN_RELATED_SCORE) return null;

  return {
    note: candidate,
    score,
    duplicate,
    sharedTerms: shared
      .sort((left, right) => right.weight - left.weight || left.term.localeCompare(right.term))
      .slice(0, 4)
      .map(({ term }) => term),
  };
}

function fingerprint(note: NoteRecord): NoteFingerprint {
  const terms = new Map<string, number>();
  addTerms(terms, note.title, 3);
  addTerms(terms, note.content, 1);
  const totalWeight = [...terms.values()].reduce((sum, weight) => sum + weight, 0);

  return {
    terms,
    totalWeight,
    canonicalDocument: canonicalize(`${note.title}\n${note.content}`),
  };
}

function addTerms(terms: Map<string, number>, text: string, weight: number): void {
  if (!text || terms.size >= MAX_TERMS_PER_NOTE) return;
  const normalized = text.normalize('NFKC').toLocaleLowerCase();

  for (const match of normalized.matchAll(TOKEN_PATTERN)) {
    const term = match[0];
    if (!isUsefulTerm(term)) continue;
    terms.set(term, Math.max(terms.get(term) ?? 0, weight));
    if (terms.size >= MAX_TERMS_PER_NOTE) break;
  }
}

function isUsefulTerm(term: string): boolean {
  if (STOP_WORDS.has(term)) return false;
  if (NUMBER_PATTERN.test(term)) return term.length >= 4;
  if (term.length >= 3) return true;
  return (
    term.length >= 2 &&
    [...term].some((character) => (character.codePointAt(0) ?? 0) > 0x7f)
  );
}

function canonicalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}
