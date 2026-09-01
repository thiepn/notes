import { Fragment, type ReactNode } from 'react';

export type WikiLinkRenderStatus = 'resolved' | 'missing' | 'ambiguous' | 'unknown';

export interface WikiLinkRenderResolution {
  status: WikiLinkRenderStatus;
  noteId?: string;
}

interface RichTextContentProps {
  value: string;
  compact?: boolean;
  resolveWikiLink?: (title: string) => WikiLinkRenderResolution;
  onWikiLinkOpen?: (noteId: string) => void;
}

interface InlineRenderContext {
  compact: boolean;
  resolveWikiLink?: (title: string) => WikiLinkRenderResolution;
  onWikiLinkOpen?: (noteId: string) => void;
}

export function RichTextContent({
  value,
  compact = false,
  resolveWikiLink,
  onWikiLinkOpen,
}: RichTextContentProps) {
  const blocks = parseBlocks(value);
  const context: InlineRenderContext = { compact, resolveWikiLink, onWikiLinkOpen };
  return (
    <span className="rich-text-content" data-compact={compact || undefined}>
      {blocks.map((block, index) => (
        <Fragment key={`${block.type}-${index}`}>{renderBlock(block, context)}</Fragment>
      ))}
    </span>
  );
}

type RichTextBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'bullet'; items: string[] }
  | { type: 'ordered'; items: string[] }
  | { type: 'code'; text: string };

function parseBlocks(value: string): RichTextBlock[] {
  const lines = value.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: RichTextBlock[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/u.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const heading = /^(#{2,3})\s+(.+)$/u.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]?.length === 3 ? 3 : 2,
        text: heading[2] ?? '',
      });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/u, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    if (/^-\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/u.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^-\s+/u, ''));
        index += 1;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }

    if (/^\d+\.\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/u.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/u, ''));
        index += 1;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? '';
      if (!candidate.trim() || isBlockStart(candidate)) break;
      paragraph.push(candidate);
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: paragraph });
      continue;
    }
    index += 1;
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return /^(?:```|#{2,3}\s+|>\s?|-\s+|\d+\.\s+)/u.test(line);
}

function renderBlock(block: RichTextBlock, context: InlineRenderContext): ReactNode {
  switch (block.type) {
    case 'heading':
      return (
        <span className="rich-text-heading" data-level={block.level}>
          {renderInline(block.text, context)}
        </span>
      );
    case 'paragraph':
      return (
        <span className="rich-text-paragraph">
          {block.lines.map((line, index) => (
            <Fragment key={index}>
              {index > 0 ? <br /> : null}
              {renderInline(line, context)}
            </Fragment>
          ))}
        </span>
      );
    case 'quote':
      return (
        <span className="rich-text-quote">
          {block.lines.map((line, index) => (
            <Fragment key={index}>
              {index > 0 ? <br /> : null}
              {renderInline(line, context)}
            </Fragment>
          ))}
        </span>
      );
    case 'bullet':
      return (
        <span className="rich-text-list" data-list="bullet">
          {block.items.map((item, index) => (
            <span className="rich-text-list-row" key={index}>
              <span className="rich-text-list-marker" aria-hidden="true">
                •
              </span>
              <span>{renderInline(item, context)}</span>
            </span>
          ))}
        </span>
      );
    case 'ordered':
      return (
        <span className="rich-text-list" data-list="ordered">
          {block.items.map((item, index) => (
            <span className="rich-text-list-row" key={index}>
              <span className="rich-text-list-marker" aria-hidden="true">
                {index + 1}.
              </span>
              <span>{renderInline(item, context)}</span>
            </span>
          ))}
        </span>
      );
    case 'code':
      return <span className="rich-text-code-block">{block.text}</span>;
  }
}

function renderInline(value: string, context: InlineRenderContext): ReactNode[] {
  const output: ReactNode[] = [];
  const tokenPattern =
    /(\[\[[^\[\]\n]+\]\]|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*)/giu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value)) !== null) {
    if (match.index > cursor) output.push(value.slice(cursor, match.index));
    const token = match[0];
    output.push(renderInlineToken(token, context, output.length));
    cursor = match.index + token.length;
  }

  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

function renderInlineToken(token: string, context: InlineRenderContext, key: number): ReactNode {
  if (token.startsWith('[[') && token.endsWith(']]')) {
    const title = token.slice(2, -2).trim();
    const resolution = context.resolveWikiLink?.(title) ?? { status: 'unknown' as const };
    const resolvedNoteId = resolution.status === 'resolved' ? resolution.noteId : undefined;
    const tooltip =
      resolution.status === 'missing'
        ? `No note titled “${title}”`
        : resolution.status === 'ambiguous'
          ? `Multiple notes are titled “${title}”`
          : undefined;

    if (!context.compact && resolvedNoteId && context.onWikiLinkOpen) {
      return (
        <button
          className="rich-text-wiki-link"
          data-status="resolved"
          type="button"
          key={key}
          aria-label={`Open note: ${title}`}
          onClick={() => context.onWikiLinkOpen?.(resolvedNoteId)}
        >
          {title}
        </button>
      );
    }

    return (
      <span
        className="rich-text-wiki-link"
        data-status={resolution.status}
        key={key}
        title={tooltip}
      >
        {title}
      </span>
    );
  }

  if (token.startsWith('**') && token.endsWith('**')) {
    return <strong key={key}>{renderInline(token.slice(2, -2), context)}</strong>;
  }
  if (token.startsWith('~~') && token.endsWith('~~')) {
    return <s key={key}>{renderInline(token.slice(2, -2), context)}</s>;
  }
  if (token.startsWith('`') && token.endsWith('`')) {
    return <code key={key}>{token.slice(1, -1)}</code>;
  }
  if (token.startsWith('*') && token.endsWith('*')) {
    return <em key={key}>{renderInline(token.slice(1, -1), context)}</em>;
  }

  const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/iu.exec(token);
  if (link) {
    const label = link[1] ?? '';
    const href = link[2] ?? '';
    if (context.compact) {
      return (
        <span className="rich-text-link" key={key}>
          {label}
        </span>
      );
    }
    return (
      <a className="rich-text-link" href={href} key={key} rel="noreferrer" target="_blank">
        {label}
      </a>
    );
  }

  return token;
}
