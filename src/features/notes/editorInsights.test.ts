import { describe, expect, it } from 'vitest';

import { checklistEditorMetrics, editorSaveLabel, textEditorMetrics } from './editorInsights';

describe('editor insights', () => {
  it('counts visible rich-text words and characters rather than Markdown markers', () => {
    expect(textEditorMetrics('**Hello** _world_')).toEqual({ words: 2, characters: 11 });
    expect(textEditorMetrics('')).toEqual({ words: 0, characters: 0 });
  });

  it('counts only meaningful checklist rows and completed meaningful rows', () => {
    expect(
      checklistEditorMetrics([
        { id: 'a', text: 'First', checked: true, parentId: null },
        { id: 'b', text: ' ', checked: true, parentId: null },
        { id: 'c', text: 'Second', checked: false, parentId: null },
      ]),
    ).toEqual({ items: 2, completed: 1 });
  });

  it('reports autosave state without treating pending edits as saved', () => {
    expect(editorSaveLabel('idle', false)).toBe('Saved');
    expect(editorSaveLabel('idle', true)).toBe('Waiting to save…');
    expect(editorSaveLabel('saving', true)).toBe('Saving…');
    expect(editorSaveLabel('error', true)).toBe('Save failed');
  });
});
