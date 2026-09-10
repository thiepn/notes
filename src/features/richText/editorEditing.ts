import { applyRichTextCommand, type RichTextCommand, type RichTextEditResult } from './richText';

export type RichTextSlashCommand =
  'heading' | 'bulletList' | 'orderedList' | 'quote' | 'codeBlock' | 'wikiLink';

export interface SlashCommandMatch {
  query: string;
  start: number;
  end: number;
}

export function findSlashCommand(value: string, selectionStart: number, selectionEnd: number) {
  if (selectionStart !== selectionEnd) return null;
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const match = /^\/([\p{L}\p{N}-]*)$/u.exec(beforeCursor);
  if (!match) return null;

  return {
    query: (match[1] ?? '').toLocaleLowerCase(),
    start: lineStart,
    end: selectionStart,
  } satisfies SlashCommandMatch;
}

export function applySlashCommand(
  value: string,
  match: SlashCommandMatch,
  command: RichTextSlashCommand,
): RichTextEditResult {
  const nextValue = `${value.slice(0, match.start)}${value.slice(match.end)}`;
  return applyRichTextCommand(nextValue, match.start, match.start, command as RichTextCommand);
}

export function continueRichTextBlock(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): RichTextEditResult | null {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lineBreak = value.indexOf('\n', selectionStart);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionStart, lineEnd);

  const bullet = /^(\s*)-\s(.*)$/u.exec(beforeCursor);
  if (bullet) {
    const indentation = bullet[1] ?? '';
    const content = bullet[2] ?? '';
    if (!content.trim() && !afterCursor.trim()) {
      return exitEmptyBlock(value, lineStart, lineEnd, indentation);
    }
    return insertContinuation(value, selectionStart, `${indentation}- `);
  }

  const ordered = /^(\s*)(\d+)\.\s(.*)$/u.exec(beforeCursor);
  if (ordered) {
    const indentation = ordered[1] ?? '';
    const number = Number.parseInt(ordered[2] ?? '0', 10);
    const content = ordered[3] ?? '';
    if (!content.trim() && !afterCursor.trim()) {
      return exitEmptyBlock(value, lineStart, lineEnd, indentation);
    }
    return insertContinuation(value, selectionStart, `${indentation}${number + 1}. `);
  }

  const quote = /^(\s*)>\s?(.*)$/u.exec(beforeCursor);
  if (quote) {
    const indentation = quote[1] ?? '';
    const content = quote[2] ?? '';
    if (!content.trim() && !afterCursor.trim()) {
      return exitEmptyBlock(value, lineStart, lineEnd, indentation);
    }
    return insertContinuation(value, selectionStart, `${indentation}> `);
  }

  return null;
}

export function linkSelectionWithPastedUrl(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  clipboardText: string,
): RichTextEditResult | null {
  if (selectionStart === selectionEnd) return null;
  const url = clipboardText.trim();
  if (!/^https?:\/\/\S+$/iu.test(url)) return null;

  const selected = value.slice(selectionStart, selectionEnd);
  if (!selected.trim() || selected.includes('\n')) return null;

  const replacement = `[${selected}](${url})`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const cursor = selectionStart + replacement.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

function insertContinuation(
  value: string,
  selectionStart: number,
  marker: string,
): RichTextEditResult {
  const insertion = `\n${marker}`;
  const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionStart)}`;
  const cursor = selectionStart + insertion.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

function exitEmptyBlock(
  value: string,
  lineStart: number,
  lineEnd: number,
  indentation: string,
): RichTextEditResult {
  const nextValue = `${value.slice(0, lineStart)}${indentation}${value.slice(lineEnd)}`;
  const cursor = lineStart + indentation.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}
