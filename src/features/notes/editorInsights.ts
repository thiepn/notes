import type { ChecklistDraftItem } from '../../db';
import { richTextToPlainText } from '../richText/richText';

export interface TextEditorMetrics {
  words: number;
  characters: number;
}

export interface ChecklistEditorMetrics {
  items: number;
  completed: number;
}

export function textEditorMetrics(content: string): TextEditorMetrics {
  const visibleText = richTextToPlainText(content);
  return {
    words: countWords(visibleText),
    characters: Array.from(visibleText).length,
  };
}

export function checklistEditorMetrics(items: ChecklistDraftItem[]): ChecklistEditorMetrics {
  const meaningful = items.filter((item) => item.text.trim().length > 0);
  return {
    items: meaningful.length,
    completed: meaningful.filter((item) => item.checked).length,
  };
}

export function editorSaveLabel(
  status: 'idle' | 'saving' | 'error',
  hasPendingChanges: boolean,
): string {
  if (status === 'error') return 'Save failed';
  if (status === 'saving') return 'Saving…';
  if (hasPendingChanges) return 'Waiting to save…';
  return 'Saved';
}

export function formatEditorSavedTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
