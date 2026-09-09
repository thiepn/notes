from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected}, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, expected))


# Pure checklist model helpers.
replace(
    'src/features/notes/checklistModel.ts',
    '''export function clearCompletedChecklistItems(items: ChecklistDraftItem[]): ChecklistDraftItem[] {
''',
    '''export function duplicateChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
): { items: ChecklistDraftItem[]; duplicatedId: string } {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return { items, duplicatedId: '' };
  const source = items[index];
  if (!source) return { items, duplicatedId: '' };

  if (source.parentId !== null) {
    const duplicate = { ...source, id: crypto.randomUUID() };
    const next = [...items];
    next.splice(index + 1, 0, duplicate);
    return { items: next, duplicatedId: duplicate.id };
  }

  const block = rootBlock(items, index);
  const duplicateRoot = { ...source, id: crypto.randomUUID() };
  const duplicateBlock = [duplicateRoot];
  for (const child of block.slice(1)) {
    duplicateBlock.push({ ...child, id: crypto.randomUUID(), parentId: duplicateRoot.id });
  }
  const next = [...items];
  next.splice(index + block.length, 0, ...duplicateBlock);
  return { items: next, duplicatedId: duplicateRoot.id };
}

export function setAllChecklistItemsChecked(
  items: ChecklistDraftItem[],
  checked: boolean,
): ChecklistDraftItem[] {
  return items.map((item) => (item.text.trim() ? { ...item, checked } : item));
}

export function clearCompletedChecklistItems(items: ChecklistDraftItem[]): ChecklistDraftItem[] {
''',
)

replace(
    'src/features/notes/checklistModel.test.ts',
    '''  clearCompletedChecklistItems,
  indentChecklistItem,
''',
    '''  clearCompletedChecklistItems,
  duplicateChecklistItem,
  indentChecklistItem,
''',
)
replace(
    'src/features/notes/checklistModel.test.ts',
    '''  reorderChecklistBefore,
  toggleChecklistItem,
''',
    '''  reorderChecklistBefore,
  setAllChecklistItemsChecked,
  toggleChecklistItem,
''',
)
replace(
    'src/features/notes/checklistModel.test.ts',
    '''  it('clearing a completed parent also removes its children', () => {
''',
    '''  it('duplicates a root together with its child block and remaps the copied parent', () => {
    const items = [item('a', 'Parent'), item('b', 'Child', 'a'), item('c', 'Other')];
    const duplicated = duplicateChecklistItem(items, 'a');
    expect(duplicated.items).toHaveLength(5);
    expect(duplicated.items.map((entry) => entry.text)).toEqual([
      'Parent',
      'Child',
      'Parent',
      'Child',
      'Other',
    ]);
    const copiedRoot = duplicated.items[2];
    const copiedChild = duplicated.items[3];
    expect(copiedRoot?.id).not.toBe('a');
    expect(copiedChild?.parentId).toBe(copiedRoot?.id);
    expect(duplicated.duplicatedId).toBe(copiedRoot?.id);
  });

  it('checks or unchecks all meaningful items without changing empty rows', () => {
    const blank = item('blank', '');
    const next = setAllChecklistItemsChecked([item('a', 'A'), blank], true);
    expect(next[0]?.checked).toBe(true);
    expect(next[1]?.checked).toBe(false);
    expect(setAllChecklistItemsChecked(next, false)[0]?.checked).toBe(false);
  });

  it('clearing a completed parent also removes its children', () => {
''',
)

# Checklist editing UI: progress, duplicate, explicit add, check/uncheck all.
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
''',
    '''import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CopyPlus,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''  checklistDepth,
  clearCompletedChecklistItems,
  indentChecklistItem,
''',
    '''  checklistDepth,
  clearCompletedChecklistItems,
  createChecklistDraftItem,
  duplicateChecklistItem,
  indentChecklistItem,
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''  reorderChecklistBefore,
  toggleChecklistItem,
''',
    '''  reorderChecklistBefore,
  setAllChecklistItemsChecked,
  toggleChecklistItem,
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''  const completedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const visibleItems = hideCompleted ? items.filter((item) => !item.checked) : items;
''',
    '''  const meaningfulItems = useMemo(() => items.filter((item) => item.text.trim()), [items]);
  const completedCount = useMemo(
    () => meaningfulItems.filter((item) => item.checked).length,
    [meaningfulItems],
  );
  const allMeaningfulComplete = meaningfulItems.length > 0 && completedCount === meaningfulItems.length;
  const visibleItems = hideCompleted ? items.filter((item) => !item.checked) : items;
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''      <div className="checklist-items" role="list" aria-label="Checklist items">
''',
    '''      {meaningfulItems.length > 0 ? (
        <div className="checklist-progress" aria-label="Checklist progress">
          <span>
            {completedCount} of {meaningfulItems.length} completed
          </span>
          <progress value={completedCount} max={meaningfulItems.length} />
        </div>
      ) : null}

      <div className="checklist-items" role="list" aria-label="Checklist items">
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''                <IconButton
                  className="checklist-row-action checklist-row-delete"
                  label={`Delete item ${visibleIndex + 1}`}
''',
    '''                <IconButton
                  className="checklist-row-action"
                  label={`Duplicate item ${visibleIndex + 1}`}
                  onClick={() => {
                    const duplicated = duplicateChecklistItem(items, item.id);
                    if (!duplicated.duplicatedId) return;
                    onItemsChange(duplicated.items);
                    setFocusItemId(duplicated.duplicatedId);
                  }}
                >
                  <CopyPlus />
                </IconButton>
                <IconButton
                  className="checklist-row-action checklist-row-delete"
                  label={`Delete item ${visibleIndex + 1}`}
''',
)
replace(
    'src/features/notes/ChecklistEditorFields.tsx',
    '''      <div className="checklist-options">
        <label className="checklist-option-toggle">
''',
    '''      <div className="checklist-options">
        <div className="checklist-primary-actions">
          <button
            type="button"
            onClick={() => {
              const added = createChecklistDraftItem();
              onItemsChange([...items, added]);
              setFocusItemId(added.id);
            }}
          >
            <Plus aria-hidden="true" /> Add item
          </button>
          {meaningfulItems.length > 0 ? (
            <button
              type="button"
              onClick={() => onItemsChange(setAllChecklistItemsChecked(items, !allMeaningfulComplete))}
            >
              {allMeaningfulComplete ? 'Uncheck all' : 'Check all'}
            </button>
          ) : null}
        </div>

        <label className="checklist-option-toggle">
''',
)

print('P4 checklist patch applied.')
