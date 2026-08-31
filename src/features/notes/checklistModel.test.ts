import { describe, expect, it } from 'vitest';

import type { ChecklistDraftItem } from '../../db';
import {
  clearCompletedChecklistItems,
  indentChecklistItem,
  isMeaningfulChecklist,
  moveChecklistItem,
  outdentChecklistItem,
  reorderChecklistBefore,
  toggleChecklistItem,
} from './checklistModel';

function item(id: string, text: string, parentId: string | null = null): ChecklistDraftItem {
  return { id, text, checked: false, parentId };
}

describe('checklist model', () => {
  it('indents and outdents beneath the preceding root item', () => {
    const items = [item('a', 'Parent'), item('b', 'Child')];
    const indented = indentChecklistItem(items, 'b');
    expect(indented[1]?.parentId).toBe('a');
    expect(outdentChecklistItem(indented, 'b')[1]?.parentId).toBeNull();
  });

  it('moves a root item together with its child block', () => {
    const items = [item('a', 'A'), item('b', 'B', 'a'), item('c', 'C')];
    expect(moveChecklistItem(items, 'a', 1).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('reorders a child into the target child group', () => {
    const items = [item('a', 'A'), item('b', 'B', 'a'), item('c', 'C'), item('d', 'D', 'c')];
    const next = reorderChecklistBefore(items, 'b', 'd');
    expect(next.map((entry) => entry.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(next.find((entry) => entry.id === 'b')?.parentId).toBe('c');
  });

  it('moves completed root blocks down without detaching children', () => {
    const items = [item('a', 'A'), item('b', 'B', 'a'), item('c', 'C')];
    const next = toggleChecklistItem(items, 'a', true, true);
    expect(next.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect(next.find((entry) => entry.id === 'b')?.parentId).toBe('a');
  });

  it('keeps a completed child after its parent even when it has no sibling', () => {
    const items = [item('a', 'Parent'), item('b', 'Only child', 'a'), item('c', 'Next root')];
    const next = toggleChecklistItem(items, 'b', true, true);
    expect(next.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(next[1]).toMatchObject({ id: 'b', checked: true, parentId: 'a' });
  });

  it('moves a completed child after its remaining siblings without crossing the root boundary', () => {
    const items = [
      item('a', 'Parent'),
      item('b', 'First child', 'a'),
      item('c', 'Second child', 'a'),
      item('d', 'Next root'),
    ];
    const next = toggleChecklistItem(items, 'b', true, true);
    expect(next.map((entry) => entry.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(next.find((entry) => entry.id === 'b')).toMatchObject({ checked: true, parentId: 'a' });
  });

  it('clearing a completed parent also removes its children', () => {
    const parent = { ...item('a', 'A'), checked: true };
    const child = item('b', 'B', 'a');
    const other = item('c', 'C');
    expect(clearCompletedChecklistItems([parent, child, other]).map((entry) => entry.id)).toEqual([
      'c',
    ]);
  });

  it('only treats titled or non-empty item content as meaningful', () => {
    expect(isMeaningfulChecklist('', [item('a', '')])).toBe(false);
    expect(isMeaningfulChecklist('Title', [item('a', '')])).toBe(true);
    expect(isMeaningfulChecklist('', [item('a', 'Task')])).toBe(true);
  });
});
