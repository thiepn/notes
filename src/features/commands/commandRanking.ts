import { normalizeKnowledgeText } from './knowledgeCommands';

export interface CommandSearchCandidate {
  label: string;
  description?: string;
  group: string;
  keywords?: string[];
}

export interface RankedCommandCandidate<T extends CommandSearchCandidate> {
  item: T;
  score: number;
}

const FUZZY_SCORE = 70;

export function rankCommandCandidates<T extends CommandSearchCandidate>(
  items: T[],
  query: string,
  limit = 40,
): RankedCommandCandidate<T>[] {
  if (limit <= 0) return [];
  const normalizedQuery = normalizeKnowledgeText(query);
  if (!normalizedQuery) {
    return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  }

  const terms = normalizedQuery.split(' ').filter(Boolean);
  return items
    .map((item, index) => ({ item, index, score: scoreCandidate(item, normalizedQuery, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}

function scoreCandidate(
  item: CommandSearchCandidate,
  phrase: string,
  terms: string[],
): number {
  const label = normalizeKnowledgeText(item.label);
  const description = normalizeKnowledgeText(item.description ?? '');
  const group = normalizeKnowledgeText(item.group);
  const keywords = (item.keywords ?? []).map(normalizeKnowledgeText).filter(Boolean);
  const keywordText = keywords.join(' ');
  const combined = [label, description, group, keywordText].filter(Boolean).join(' ');

  let score = phraseScore(label, phrase, 1_200, 1_080, 940);
  score = Math.max(score, phraseScore(keywordText, phrase, 900, 820, 700));
  score = Math.max(score, phraseScore(description, phrase, 700, 620, 520));
  score = Math.max(score, phraseScore(group, phrase, 500, 440, 380));

  let termScore = 0;
  for (const term of terms) {
    const best = Math.max(
      scoreTerm(label, term, 260, 220, 170),
      scoreTerm(keywordText, term, 220, 190, 150),
      scoreTerm(description, term, 150, 125, 100),
      scoreTerm(group, term, 110, 90, 75),
      fuzzyTermScore(combined, term),
    );
    if (best <= 0) return 0;
    termScore += best;
  }

  return score + termScore;
}

function phraseScore(
  value: string,
  phrase: string,
  exact: number,
  prefix: number,
  substring: number,
): number {
  if (!value || !phrase) return 0;
  if (value === phrase) return exact;
  if (value.startsWith(phrase)) return prefix;
  if (value.includes(phrase)) return substring;
  return 0;
}

function scoreTerm(
  value: string,
  term: string,
  exact: number,
  prefix: number,
  substring: number,
): number {
  if (!value || !term) return 0;
  const words = value.split(' ');
  if (words.includes(term)) return exact;
  if (words.some((word) => word.startsWith(term))) return prefix;
  if (value.includes(term)) return substring;
  return 0;
}

function fuzzyTermScore(value: string, term: string): number {
  if (term.length < 4 || !value) return 0;
  const maxDistance = term.length <= 6 ? 1 : 2;
  let bestDistance = maxDistance + 1;

  for (const word of value.split(' ')) {
    if (Math.abs(word.length - term.length) > maxDistance) continue;
    const distance = boundedLevenshtein(term, word, Math.min(maxDistance, bestDistance - 1));
    if (distance < bestDistance) {
      bestDistance = distance;
      if (bestDistance === 1) break;
    }
  }

  return bestDistance <= maxDistance ? Math.max(20, FUZZY_SCORE - bestDistance * 20) : 0;
}

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (maxDistance < 0 || Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = new Array<number>(b.length + 1);
    current[0] = row;
    let rowMinimum = row;

    for (let column = 1; column <= b.length; column += 1) {
      const substitution = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(
        (previous[column] ?? maxDistance + 1) + 1,
        (current[column - 1] ?? maxDistance + 1) + 1,
        (previous[column - 1] ?? maxDistance + 1) + substitution,
      );
      current[column] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[b.length] ?? maxDistance + 1;
}
