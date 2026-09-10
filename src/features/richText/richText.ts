export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'wikiLink'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'quote';

export interface RichTextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyRichTextCommand(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: RichTextCommand,
): RichTextEditResult {
  switch (command) {
    case 'bold':
      return wrapSelection(value, selectionStart, selectionEnd, '**', '**', 'bold text');
    case 'italic':
      return wrapSelection(value, selectionStart, selectionEnd, '*', '*', 'italic text');
    case 'strike':
      return wrapSelection(value, selectionStart, selectionEnd, '~~', '~~', 'strikethrough');
    case 'code':
      return wrapSelection(value, selectionStart, selectionEnd, '`', '`', 'code');
    case 'codeBlock':
      return insertCodeBlock(value, selectionStart, selectionEnd);
    case 'link':
      return insertLink(value, selectionStart, selectionEnd);
    case 'wikiLink':
      return wrapSelection(value, selectionStart, selectionEnd, '[[', ']]', 'Note title');
    case 'heading':
      return transformSelectedLines(value, selectionStart, selectionEnd, toggleHeading, '## ');
    case 'bulletList':
      return transformSelectedLines(value, selectionStart, selectionEnd, toggleBullets, '- ');
    case 'orderedList':
      return transformSelectedLines(value, selectionStart, selectionEnd, toggleOrderedList, '1. ');
    case 'quote':
      return transformSelectedLines(value, selectionStart, selectionEnd, toggleQuote, '> ');
  }
}

export function richTextToPlainText(value: string): string {
  return value
    .replace(/^```[^\n]*$/gmu, '')
    .replace(/^```$/gmu, '')
    .replace(/^#{2,3}\s+/gmu, '')
    .replace(/^>\s?/gmu, '')
    .replace(/^\s*[-+]\s+/gmu, '')
    .replace(/^\s*\d+\.\s+/gmu, '')
    .replace(/\[\[([^\]\n[]+)\]\]/gu, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/giu, '$1 $2')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/~~([^~\n]+)~~/gu, '$1')
    .replace(/`([^`\n]+)`/gu, '$1')
    .replace(/\*([^*\n]+)\*/gu, '$1')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): RichTextEditResult {
  const selected = value.slice(start, end);
  const content = selected || placeholder;
  const replacement = `${prefix}${content}${suffix}`;
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const contentStart = start + prefix.length;

  return {
    value: nextValue,
    selectionStart: contentStart,
    selectionEnd: contentStart + content.length,
  };
}

function insertCodeBlock(value: string, start: number, end: number): RichTextEditResult {
  const selected = value.slice(start, end);
  const content = selected || 'code';
  const leadingBreak = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const trailingBreak = end < value.length && value[end] !== '\n' ? '\n' : '';
  const replacement = `${leadingBreak}\`\`\`\n${content}\n\`\`\`${trailingBreak}`;
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const contentStart = start + leadingBreak.length + 4;

  return {
    value: nextValue,
    selectionStart: contentStart,
    selectionEnd: contentStart + content.length,
  };
}

function insertLink(value: string, start: number, end: number): RichTextEditResult {
  const selected = value.slice(start, end).trim();
  const selectedIsUrl = /^https?:\/\/\S+$/iu.test(selected);
  const label = selectedIsUrl ? 'link' : selected || 'link text';
  const url = selectedIsUrl ? selected : 'https://';
  const replacement = `[${label}](${url})`;
  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const urlStart = start + label.length + 3;

  return {
    value: nextValue,
    selectionStart: selectedIsUrl ? start + 1 : urlStart,
    selectionEnd: selectedIsUrl ? start + 1 + label.length : urlStart + url.length,
  };
}

type LineTransformer = (lines: string[]) => string[];

function transformSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transform: LineTransformer,
  emptyLinePrefix: string,
): RichTextEditResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const original = value.slice(lineStart, lineEnd);
  const collapsed = selectionStart === selectionEnd;

  if (collapsed && original.trim().length === 0) {
    const indentation = original.match(/^\s*/u)?.[0] ?? '';
    const replacement = `${indentation}${emptyLinePrefix}`;
    const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
    const cursor = lineStart + replacement.length;
    return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
  }

  const replacement = transform(original.split('\n')).join('\n');
  const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;

  if (collapsed && !original.includes('\n')) {
    const relativeCursor = selectionStart - lineStart;
    const delta = replacement.length - original.length;
    const cursor = lineStart + Math.max(0, Math.min(replacement.length, relativeCursor + delta));
    return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
  }

  return {
    value: nextValue,
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}

function toggleHeading(lines: string[]): string[] {
  const allHeadings = lines.every((line) => line.length === 0 || /^##\s/u.test(line));
  return lines.map((line) => {
    if (!line) return line;
    if (allHeadings) return line.replace(/^##\s/u, '');
    return `## ${line.replace(/^#{2,3}\s+/u, '')}`;
  });
}

function toggleBullets(lines: string[]): string[] {
  const allBullets = lines.every((line) => line.length === 0 || /^-\s/u.test(line));
  return lines.map((line) => {
    if (!line) return line;
    if (allBullets) return line.replace(/^-\s/u, '');
    return `- ${stripListPrefix(line)}`;
  });
}

function toggleOrderedList(lines: string[]): string[] {
  const allOrdered = lines.every((line) => line.length === 0 || /^\d+\.\s/u.test(line));
  let number = 0;
  return lines.map((line) => {
    if (!line) return line;
    if (allOrdered) return line.replace(/^\d+\.\s/u, '');
    number += 1;
    return `${number}. ${stripListPrefix(line)}`;
  });
}

function toggleQuote(lines: string[]): string[] {
  const allQuotes = lines.every((line) => line.length === 0 || /^>\s?/u.test(line));
  return lines.map((line) => {
    if (!line) return line;
    if (allQuotes) return line.replace(/^>\s?/u, '');
    return `> ${line.replace(/^>\s?/u, '')}`;
  });
}

function stripListPrefix(line: string): string {
  return line.replace(/^\s*(?:[-+]\s+|\d+\.\s+)/u, '');
}
