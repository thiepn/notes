export type CaptureTemplateId = 'meeting' | 'study' | 'daily';

export interface PrefilledTextCapture {
  title: string;
  content: string;
}

export interface CaptureTemplateDefinition {
  id: CaptureTemplateId;
  label: string;
  description: string;
}

const MAX_CAPTURE_TITLE = 500;
const MAX_CAPTURE_CONTENT = 1_000_000;

export const CAPTURE_TEMPLATES: CaptureTemplateDefinition[] = [
  {
    id: 'meeting',
    label: 'Meeting',
    description: 'Agenda, notes, decisions, and actions',
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Key ideas, questions, and review points',
  },
  {
    id: 'daily',
    label: 'Daily note',
    description: 'Highlights, notes, and what comes next',
  },
];

export function buildClipboardCapture(
  clipboardText: string,
  now = new Date(),
): PrefilledTextCapture | null {
  const text = sanitizeContent(clipboardText);
  if (!text) return null;

  const link = buildLinkCapture(text);
  if (link) return link;

  return {
    title: '',
    content: text,
  };
}

export function buildLinkCapture(value: string): PrefilledTextCapture | null {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return null;

  return {
    title: linkTitleFromUrl(normalized),
    content: normalized,
  };
}

export function buildTemplateCapture(
  templateId: CaptureTemplateId,
  now = new Date(),
): PrefilledTextCapture {
  const date = formatLocalDate(now);

  if (templateId === 'meeting') {
    return {
      title: `Meeting — ${date}`,
      content: '## Agenda\n\n- \n\n## Notes\n\n\n## Decisions\n\n- \n\n## Actions\n\n- [ ] ',
    };
  }

  if (templateId === 'study') {
    return {
      title: `Study notes — ${date}`,
      content: '## Key ideas\n\n\n## Questions\n\n- \n\n## Review\n\n- ',
    };
  }

  return {
    title: `Daily note — ${date}`,
    content: '## Today\n\n\n## Highlights\n\n- \n\n## Next\n\n- [ ] ',
  };
}

export function linkTitleFromUrl(value: string): string {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return '';

  try {
    const hostname = new URL(normalized).hostname.replace(/^www\./iu, '');
    return hostname.slice(0, MAX_CAPTURE_TITLE);
  } catch {
    return '';
  }
}

export function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.replaceAll('\0', '').trim();
  if (!trimmed || /\s/u.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, MAX_CAPTURE_CONTENT);
  } catch {
    return null;
  }
}

function sanitizeContent(value: string): string {
  return value.replaceAll('\0', '').trim().slice(0, MAX_CAPTURE_CONTENT);
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear().toString().padStart(4, '0');
  const month = (value.getMonth() + 1).toString().padStart(2, '0');
  const day = value.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
