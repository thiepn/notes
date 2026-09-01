import type { NoteRecord } from '../../db';
import { richTextToPlainText } from '../richText/richText';

export type WikiLinkStatus = 'resolved' | 'missing' | 'ambiguous';

export interface WikiLinkToken {
  title: string;
  start: number;
  end: number;
}

export interface WikiLinkResolution {
  title: string;
  normalizedTitle: string;
  status: WikiLinkStatus;
  noteId?: string;
  matches: NoteRecord[];
}

export interface OutgoingWikiLink {
  title: string;
  count: number;
  resolution: WikiLinkResolution;
}

export interface Backlink {
  note: NoteRecord;
  count: number;
}

export interface UnlinkedMention {
  note: NoteRecord;
  count: number;
  snippet: string;
}

export interface NoteConnections {
  outgoing: OutgoingWikiLink[];
  backlinks: Backlink[];
  unlinkedMentions: UnlinkedMention[];
  titleCollisionCount: number;
}

interface TextRange {
  start: number;
  end: number;
}

export function normalizeWikiTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function parseWikiLinks(value: string): WikiLinkToken[] {
  const excluded = collectCodeRanges(value);
  const tokens: WikiLinkToken[] = [];
  const pattern = /\[\[([^\]\n[]{1,200})\]\]/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const title = (match[1] ?? '').trim();
    if (!title) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (overlapsAny(start, end, excluded)) continue;
    tokens.push({ title, start, end });
  }

  return tokens;
}

export function resolveWikiLink(title: string, notes: NoteRecord[]): WikiLinkResolution {
  const normalizedTitle = normalizeWikiTitle(title);
  const matches = normalizedTitle
    ? notes.filter(
        (note) => note.trashedAt === null && normalizeWikiTitle(note.title) === normalizedTitle,
      )
    : [];

  if (matches.length === 1) {
    return {
      title,
      normalizedTitle,
      status: 'resolved',
      noteId: matches[0]!.id,
      matches,
    };
  }

  return {
    title,
    normalizedTitle,
    status: matches.length === 0 ? 'missing' : 'ambiguous',
    matches,
  };
}

export function getOutgoingWikiLinks(note: NoteRecord, notes: NoteRecord[]): OutgoingWikiLink[] {
  if (note.type !== 'text') return [];

  const grouped = new Map<string, { title: string; count: number }>();
  for (const token of parseWikiLinks(note.content)) {
    const normalized = normalizeWikiTitle(token.title);
    const existing = grouped.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(normalized, { title: token.title, count: 1 });
    }
  }

  return [...grouped.values()]
    .map(({ title, count }) => ({ title, count, resolution: resolveWikiLink(title, notes) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getBacklinks(target: NoteRecord, notes: NoteRecord[]): Backlink[] {
  if (!target.title.trim() || titleCollisionCount(target, notes) !== 1) return [];

  const backlinks: Backlink[] = [];
  for (const source of notes) {
    if (source.id === target.id || source.type !== 'text' || source.trashedAt !== null) continue;
    let count = 0;
    for (const token of parseWikiLinks(source.content)) {
      const resolution = resolveWikiLink(token.title, notes);
      if (resolution.status === 'resolved' && resolution.noteId === target.id) count += 1;
    }
    if (count > 0) backlinks.push({ note: source, count });
  }

  return backlinks.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
}

export function findUnlinkedMentions(target: NoteRecord, notes: NoteRecord[]): UnlinkedMention[] {
  const title = target.title.trim();
  if (title.length < 3 || titleCollisionCount(target, notes) !== 1) return [];

  const mentions: UnlinkedMention[] = [];
  for (const source of notes) {
    if (source.id === target.id || source.type !== 'text' || source.trashedAt !== null) continue;
    const ranges = findUnlinkedMentionRanges(source.content, title);
    if (ranges.length === 0) continue;
    const first = ranges[0];
    mentions.push({
      note: source,
      count: ranges.length,
      snippet: first ? createSnippet(source.content, first.start, first.end) : source.title,
    });
  }

  return mentions.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
}

export function analyzeNoteConnections(target: NoteRecord, notes: NoteRecord[]): NoteConnections {
  return {
    outgoing: getOutgoingWikiLinks(target, notes),
    backlinks: getBacklinks(target, notes),
    unlinkedMentions: findUnlinkedMentions(target, notes),
    titleCollisionCount: titleCollisionCount(target, notes),
  };
}

export function linkUnlinkedMentions(content: string, targetTitle: string): string {
  const title = targetTitle.trim();
  if (!title) return content;
  const ranges = findUnlinkedMentionRanges(content, title);
  if (ranges.length === 0) return content;

  let next = content;
  for (const range of [...ranges].reverse()) {
    next = `${next.slice(0, range.start)}[[${title}]]${next.slice(range.end)}`;
  }
  return next;
}

export function titleCollisionCount(target: NoteRecord, notes: NoteRecord[]): number {
  const normalized = normalizeWikiTitle(target.title);
  if (!normalized) return 0;
  return notes.filter(
    (note) => note.trashedAt === null && normalizeWikiTitle(note.title) === normalized,
  ).length;
}

function findUnlinkedMentionRanges(content: string, title: string): TextRange[] {
  const excluded = collectExcludedMentionRanges(content);
  const escapedTitle = escapeRegExp(title).replace(/\s+/gu, '\\s+');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedTitle})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
  const ranges: TextRange[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const prefix = match[1] ?? '';
    const matchedTitle = match[2] ?? '';
    const start = match.index + prefix.length;
    const end = start + matchedTitle.length;
    if (!overlapsAny(start, end, excluded)) ranges.push({ start, end });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }

  return ranges;
}

function collectExcludedMentionRanges(content: string): TextRange[] {
  const ranges = [...collectCodeRanges(content)];
  for (const token of parseWikiLinks(content)) ranges.push({ start: token.start, end: token.end });

  const markdownLinkPattern = /\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)/giu;
  let match: RegExpExecArray | null;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  return ranges;
}

function collectCodeRanges(content: string): TextRange[] {
  const ranges: TextRange[] = [];
  const fenced = /```[\s\S]*?(?:```|$)/gu;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(content)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  const inline = /`[^`\n]*`/gu;
  while ((match = inline.exec(content)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlapsAny(start, end, ranges)) ranges.push({ start, end });
  }
  return ranges;
}

function overlapsAny(start: number, end: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function createSnippet(content: string, start: number, end: number): string {
  const before = Math.max(0, start - 64);
  const after = Math.min(content.length, end + 96);
  const visible = richTextToPlainText(content.slice(before, after)).replace(/\s+/gu, ' ').trim();
  return `${before > 0 ? '…' : ''}${visible}${after < content.length ? '…' : ''}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
