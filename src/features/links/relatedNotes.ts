import type { LabelRecord, NoteRecord } from '../../db';
import { normalizeWikiTitle, parseWikiLinks } from './linkIntelligence';

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const NUMBER_PATTERN = /^\p{N}+$/u;
const MAX_TERMS_PER_NOTE = 600;
const DEFAULT_LIMIT = 5;
const MIN_RELATED_SCORE = 0.16;
const MAX_SHARED_SIGNALS = 4;

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

export interface RelatedNotesContext {
  labels?: LabelRecord[];
  labelIdsByNote?: Record<string, string[]>;
}

export interface RelatedNote {
  note: NoteRecord;
  score: number;
  duplicate: boolean;
  duplicateReason: string | null;
  sharedTerms: string[];
  sharedLabels: string[];
  sharedLinkTargets: string[];
}

export interface SuggestedLabel {
  label: LabelRecord;
  score: number;
  support: number;
  directMatch: boolean;
}

export interface LocalTopic {
  key: string;
  label: string;
  kind: 'label' | 'term';
  support: number;
}

interface NoteFingerprint {
  terms: Map<string, number>;
  bodyTerms: Map<string, number>;
  titleTerms: Map<string, number>;
  totalWeight: number;
  bodyWeight: number;
  titleWeight: number;
  canonicalDocument: string;
  canonicalTitle: string;
  canonicalBody: string;
}

interface LinkContext {
  titleIndex: Map<string, string | null>;
  targetsByNote: Map<string, Set<string>>;
  displayTitleById: Map<string, string>;
}

interface RelatedComparisonContext {
  labelsById: Map<string, LabelRecord>;
  labelIdsByNote: Record<string, string[]>;
  linkContext: LinkContext;
  sourceLabelIds: Set<string>;
  sourceLinkTargets: Set<string>;
}

export function findRelatedNotes(
  source: NoteRecord,
  library: NoteRecord[],
  limit = DEFAULT_LIMIT,
  context: RelatedNotesContext = {},
): RelatedNote[] {
  if (limit <= 0) return [];

  const sourceFingerprint = fingerprint(source);
  const labelIdsByNote = context.labelIdsByNote ?? {};
  const labelsById = new Map((context.labels ?? []).map((label) => [label.id, label]));
  const linkContext = buildLinkContext(library);
  const comparisonContext: RelatedComparisonContext = {
    labelsById,
    labelIdsByNote,
    linkContext,
    sourceLabelIds: new Set(labelIdsByNote[source.id] ?? []),
    sourceLinkTargets: linkContext.targetsByNote.get(source.id) ?? new Set<string>(),
  };

  if (
    sourceFingerprint.totalWeight === 0 &&
    comparisonContext.sourceLabelIds.size === 0 &&
    comparisonContext.sourceLinkTargets.size === 0
  ) {
    return [];
  }

  return library
    .filter((candidate) => candidate.id !== source.id && candidate.trashedAt === null)
    .map((candidate) => compare(sourceFingerprint, candidate, comparisonContext))
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

export function suggestLabelsForNote(
  source: NoteRecord,
  related: RelatedNote[],
  labels: LabelRecord[],
  labelIdsByNote: Record<string, string[]>,
  limit = 4,
): SuggestedLabel[] {
  if (limit <= 0 || labels.length === 0) return [];
  const currentLabels = new Set(labelIdsByNote[source.id] ?? []);
  const sourceText = normalizePhrase(`${source.title} ${source.content}`);
  const candidates = new Map<
    string,
    { label: LabelRecord; score: number; support: Set<string>; directMatch: boolean }
  >();

  for (const label of labels) {
    if (currentLabels.has(label.id)) continue;
    const normalizedLabel = normalizePhrase(label.name);
    const directMatch = normalizedLabel.length >= 3 && sourceText.includes(normalizedLabel);
    if (directMatch) {
      candidates.set(label.id, {
        label,
        score: 0.48,
        support: new Set(),
        directMatch: true,
      });
    }
  }

  for (const relation of related) {
    if (relation.note.trashedAt !== null || relation.duplicate) continue;
    const relationWeight = Math.max(0.08, Math.min(0.42, relation.score));
    for (const labelId of labelIdsByNote[relation.note.id] ?? []) {
      if (currentLabels.has(labelId)) continue;
      const label = labels.find((candidate) => candidate.id === labelId);
      if (!label) continue;
      const existing = candidates.get(labelId) ?? {
        label,
        score: 0,
        support: new Set<string>(),
        directMatch: false,
      };
      existing.score += relationWeight;
      existing.support.add(relation.note.id);
      candidates.set(labelId, existing);
    }
  }

  return [...candidates.values()]
    .filter(
      (candidate) =>
        candidate.directMatch || candidate.support.size >= 2 || candidate.score >= 0.36,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.support.size - left.support.size ||
        left.label.name.localeCompare(right.label.name, undefined, { sensitivity: 'base' }),
    )
    .slice(0, limit)
    .map((candidate) => ({
      label: candidate.label,
      score: Math.min(1, candidate.score),
      support: candidate.support.size,
      directMatch: candidate.directMatch,
    }));
}

export function summarizeLocalTopics(
  source: NoteRecord,
  related: RelatedNote[],
  labels: LabelRecord[],
  labelIdsByNote: Record<string, string[]>,
  limit = 5,
): LocalTopic[] {
  if (limit <= 0) return [];
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const labelSupport = new Map<string, Set<string>>();
  const termSupport = new Map<string, Set<string>>();
  const considered = [
    { note: source, sharedTerms: [] as string[] },
    ...related.filter((item) => !item.duplicate).slice(0, 8),
  ];

  for (const item of considered) {
    const note = item.note;
    for (const labelId of labelIdsByNote[note.id] ?? []) {
      const support = labelSupport.get(labelId) ?? new Set<string>();
      support.add(note.id);
      labelSupport.set(labelId, support);
    }
    for (const term of item.sharedTerms) {
      const support = termSupport.get(term) ?? new Set<string>();
      support.add(note.id);
      termSupport.set(term, support);
    }
  }

  const labelTopics: LocalTopic[] = [...labelSupport.entries()]
    .filter(([, support]) => support.size >= 2)
    .flatMap(([labelId, support]) => {
      const label = labelById.get(labelId);
      return label
        ? [
            {
              key: `label:${labelId}`,
              label: label.name,
              kind: 'label' as const,
              support: support.size,
            },
          ]
        : [];
    });

  const normalizedLabelNames = new Set(labels.map((label) => normalizePhrase(label.name)));
  const termTopics: LocalTopic[] = [...termSupport.entries()]
    .filter(
      ([term, support]) => support.size >= 2 && !normalizedLabelNames.has(normalizePhrase(term)),
    )
    .map(([term, support]) => ({
      key: `term:${term}`,
      label: term,
      kind: 'term' as const,
      support: support.size,
    }));

  return [...labelTopics, ...termTopics]
    .sort(
      (left, right) =>
        right.support - left.support ||
        Number(left.kind === 'label') - Number(right.kind === 'label') ||
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
    )
    .slice(0, limit);
}

function compare(
  source: NoteFingerprint,
  candidate: NoteRecord,
  context: RelatedComparisonContext,
): RelatedNote | null {
  const target = fingerprint(candidate);
  const lexical = weightedSimilarity(
    source.terms,
    source.totalWeight,
    target.terms,
    target.totalWeight,
  );
  const body = weightedSimilarity(
    source.bodyTerms,
    source.bodyWeight,
    target.bodyTerms,
    target.bodyWeight,
  );
  const title = weightedSimilarity(
    source.titleTerms,
    source.titleWeight,
    target.titleTerms,
    target.titleWeight,
  );

  const targetLabelIds = new Set(context.labelIdsByNote[candidate.id] ?? []);
  const sharedLabelIds = intersection(context.sourceLabelIds, targetLabelIds);
  const labelSimilarity = setJaccard(context.sourceLabelIds, targetLabelIds);
  const targetLinkTargets =
    context.linkContext.targetsByNote.get(candidate.id) ?? new Set<string>();
  const sharedLinkIds = intersection(context.sourceLinkTargets, targetLinkTargets);
  const linkSimilarity = setJaccard(context.sourceLinkTargets, targetLinkTargets);

  const exactDuplicate =
    source.canonicalDocument.length > 1 && source.canonicalDocument === target.canonicalDocument;
  const sameBody =
    source.canonicalBody.length >= 24 && source.canonicalBody === target.canonicalBody;
  const sameTitle =
    source.canonicalTitle.length >= 3 && source.canonicalTitle === target.canonicalTitle;
  const strongNearDuplicate = title.score >= 0.82 && body.score >= 0.72 && body.containment >= 0.82;
  const titledNearDuplicate = sameTitle && body.score >= 0.66 && body.containment >= 0.78;
  const duplicate = exactDuplicate || sameBody || strongNearDuplicate || titledNearDuplicate;
  const duplicateReason = exactDuplicate
    ? 'Same title and content'
    : sameBody
      ? 'Same content'
      : strongNearDuplicate || titledNearDuplicate
        ? 'Very similar title and content'
        : null;

  const score = Math.min(1, lexical.score + 0.18 * labelSimilarity + 0.12 * linkSimilarity);
  if (!duplicate && score < MIN_RELATED_SCORE) return null;

  return {
    note: candidate,
    score,
    duplicate,
    duplicateReason,
    sharedTerms: lexical.shared.slice(0, MAX_SHARED_SIGNALS),
    sharedLabels: sharedLabelIds
      .map((labelId) => context.labelsById.get(labelId)?.name)
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_SHARED_SIGNALS),
    sharedLinkTargets: sharedLinkIds
      .map((noteId) => context.linkContext.displayTitleById.get(noteId) ?? 'Untitled note')
      .slice(0, MAX_SHARED_SIGNALS),
  };
}

function fingerprint(note: NoteRecord): NoteFingerprint {
  const terms = new Map<string, number>();
  const titleTerms = new Map<string, number>();
  const bodyTerms = new Map<string, number>();
  addTerms(terms, note.title, 3);
  addTerms(terms, note.content, 1);
  addTerms(titleTerms, note.title, 1);
  addTerms(bodyTerms, note.content, 1);
  return {
    terms,
    titleTerms,
    bodyTerms,
    totalWeight: totalWeight(terms),
    titleWeight: totalWeight(titleTerms),
    bodyWeight: totalWeight(bodyTerms),
    canonicalDocument: canonicalize(`${note.title}\n${note.content}`),
    canonicalTitle: canonicalize(note.title),
    canonicalBody: canonicalize(note.content),
  };
}

function weightedSimilarity(
  sourceTerms: Map<string, number>,
  sourceWeight: number,
  targetTerms: Map<string, number>,
  targetWeight: number,
): { score: number; containment: number; shared: string[] } {
  if (sourceWeight === 0 || targetWeight === 0) return { score: 0, containment: 0, shared: [] };
  let sharedWeight = 0;
  const shared: Array<{ term: string; weight: number }> = [];
  for (const [term, sourceTermWeight] of sourceTerms) {
    const targetTermWeight = targetTerms.get(term);
    if (targetTermWeight === undefined) continue;
    const weight = Math.min(sourceTermWeight, targetTermWeight);
    sharedWeight += weight;
    shared.push({ term, weight });
  }
  if (sharedWeight === 0) return { score: 0, containment: 0, shared: [] };
  const union = sourceWeight + targetWeight - sharedWeight;
  const jaccard = sharedWeight / union;
  const containment = sharedWeight / Math.min(sourceWeight, targetWeight);
  return {
    score: 0.7 * jaccard + 0.3 * containment,
    containment,
    shared: shared
      .sort((left, right) => right.weight - left.weight || left.term.localeCompare(right.term))
      .map(({ term }) => term),
  };
}

function buildLinkContext(library: NoteRecord[]): LinkContext {
  const titleIndex = new Map<string, string | null>();
  const displayTitleById = new Map<string, string>();
  for (const note of library) {
    if (note.trashedAt !== null) continue;
    displayTitleById.set(note.id, note.title.trim() || 'Untitled note');
    const normalized = normalizeWikiTitle(note.title);
    if (!normalized) continue;
    if (titleIndex.has(normalized)) titleIndex.set(normalized, null);
    else titleIndex.set(normalized, note.id);
  }

  const targetsByNote = new Map<string, Set<string>>();
  for (const note of library) {
    if (note.type !== 'text' || note.trashedAt !== null) continue;
    const targets = new Set<string>();
    for (const token of parseWikiLinks(note.content)) {
      const targetId = titleIndex.get(normalizeWikiTitle(token.title));
      if (targetId) targets.add(targetId);
    }
    targetsByNote.set(note.id, targets);
  }
  return { titleIndex, targetsByNote, displayTitleById };
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
  return term.length >= 2 && [...term].some((character) => (character.codePointAt(0) ?? 0) > 0x7f);
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  if (left.size === 0 || right.size === 0) return [];
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  return [...smaller].filter((value) => larger.has(value));
}

function setJaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const shared = intersection(left, right).length;
  if (shared === 0) return 0;
  return shared / (left.size + right.size - shared);
}

function totalWeight(terms: Map<string, number>): number {
  return [...terms.values()].reduce((sum, weight) => sum + weight, 0);
}

function canonicalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function normalizePhrase(value: string): string {
  return canonicalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
