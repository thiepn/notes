import type { ChecklistDraftItem } from '../../db';

export function createChecklistDraftItem(
  text = '',
  parentId: string | null = null,
): ChecklistDraftItem {
  return { id: crypto.randomUUID(), text, checked: false, parentId };
}

export function isMeaningfulChecklist(title: string, items: ChecklistDraftItem[]): boolean {
  return Boolean(title.trim() || items.some((item) => item.text.trim()));
}

export function insertChecklistItemAfter(
  items: ChecklistDraftItem[],
  itemId: string,
): { items: ChecklistDraftItem[]; insertedId: string } {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return { items, insertedId: '' };
  const current = items[index];
  if (!current) return { items, insertedId: '' };
  const inserted = createChecklistDraftItem('', current.parentId);
  const next = [...items];
  next.splice(index + 1, 0, inserted);
  return { items: next, insertedId: inserted.id };
}

export function removeChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
): { items: ChecklistDraftItem[]; focusId: string | null } {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0 || items.length <= 1) return { items, focusId: null };
  const item = items[index];
  if (!item) return { items, focusId: null };
  const removedIds = new Set([item.id]);
  if (item.parentId === null) {
    for (const candidate of items) {
      if (candidate.parentId === item.id) removedIds.add(candidate.id);
    }
  }
  const next = items.filter((candidate) => !removedIds.has(candidate.id));
  const focusIndex = Math.min(index - 1, next.length - 1);
  return { items: next, focusId: next[focusIndex]?.id ?? null };
}

export function indentChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
): ChecklistDraftItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index <= 0) return items;
  const current = items[index];
  const previous = items[index - 1];
  if (!current || !previous || current.parentId !== null) return items;
  const parentId = previous.parentId ?? previous.id;
  return items.map((item) => (item.id === itemId ? { ...item, parentId } : item));
}

export function outdentChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
): ChecklistDraftItem[] {
  return items.map((item) =>
    item.id === itemId && item.parentId !== null ? { ...item, parentId: null } : item,
  );
}

export function moveChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
  direction: -1 | 1,
): ChecklistDraftItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return items;
  const item = items[index];
  if (!item) return items;

  if (item.parentId !== null) {
    const siblingIndexes = items
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate }) => candidate.parentId === item.parentId)
      .map(({ candidateIndex }) => candidateIndex);
    const siblingPosition = siblingIndexes.indexOf(index);
    const targetIndex = siblingIndexes[siblingPosition + direction];
    if (targetIndex === undefined) return items;
    return swap(items, index, targetIndex);
  }

  const rootIndexes = items
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidate }) => candidate.parentId === null)
    .map(({ candidateIndex }) => candidateIndex);
  const rootPosition = rootIndexes.indexOf(index);
  const targetRootIndex = rootIndexes[rootPosition + direction];
  if (targetRootIndex === undefined) return items;

  const sourceBlock = rootBlock(items, index);
  const targetBlock = rootBlock(items, targetRootIndex);
  const sourceIds = new Set(sourceBlock.map((candidate) => candidate.id));
  const remaining = items.filter((candidate) => !sourceIds.has(candidate.id));
  const targetId = targetBlock[0]?.id;
  if (!targetId) return items;
  const targetInRemaining = remaining.findIndex((candidate) => candidate.id === targetId);
  const insertAt = direction < 0 ? targetInRemaining : targetInRemaining + targetBlock.length;
  const next = [...remaining];
  next.splice(insertAt, 0, ...sourceBlock);
  return next;
}

export function reorderChecklistBefore(
  items: ChecklistDraftItem[],
  sourceId: string,
  targetId: string,
): ChecklistDraftItem[] {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const source = items[sourceIndex];
  const target = items[targetIndex];
  if (!source || !target) return items;

  if (source.parentId === null) {
    const block = rootBlock(items, sourceIndex);
    const blockIds = new Set(block.map((item) => item.id));
    if (blockIds.has(targetId)) return items;
    const remaining = items.filter((item) => !blockIds.has(item.id));
    const targetRootId = target.parentId ?? target.id;
    const insertAt = remaining.findIndex((item) => item.id === targetRootId);
    if (insertAt < 0) return items;
    const next = [...remaining];
    next.splice(insertAt, 0, ...block);
    return next;
  }

  const nextSource = { ...source, parentId: target.parentId };
  const remaining = items.filter((item) => item.id !== sourceId);
  const insertAt = remaining.findIndex((item) => item.id === targetId);
  if (insertAt < 0) return items;
  const next = [...remaining];
  next.splice(insertAt, 0, nextSource);
  return next;
}

export function toggleChecklistItem(
  items: ChecklistDraftItem[],
  itemId: string,
  checked: boolean,
  moveCompletedDown: boolean,
): ChecklistDraftItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return items;
  const item = items[index];
  if (!item) return items;
  let next = items.map((candidate) =>
    candidate.id === itemId ? { ...candidate, checked } : candidate,
  );
  if (!checked || !moveCompletedDown) return next;

  const updatedIndex = next.findIndex((candidate) => candidate.id === itemId);
  const updated = next[updatedIndex];
  if (!updated) return next;

  if (updated.parentId !== null) {
    next = next.filter((candidate) => candidate.id !== itemId);
    let insertAt = next.findIndex((candidate) => candidate.id === updated.parentId);
    if (insertAt < 0) return items;
    for (let i = insertAt + 1; i < next.length; i += 1) {
      if (next[i]?.parentId === updated.parentId) insertAt = i;
    }
    next.splice(insertAt + 1, 0, updated);
    return next;
  }

  const block = rootBlock(next, updatedIndex);
  const blockIds = new Set(block.map((candidate) => candidate.id));
  return [...next.filter((candidate) => !blockIds.has(candidate.id)), ...block];
}

export function clearCompletedChecklistItems(items: ChecklistDraftItem[]): ChecklistDraftItem[] {
  const removeIds = new Set(items.filter((item) => item.checked).map((item) => item.id));
  for (const item of items) {
    if (item.parentId !== null && removeIds.has(item.parentId)) removeIds.add(item.id);
  }
  const next = items.filter((item) => !removeIds.has(item.id));
  return next.length > 0 ? next : [createChecklistDraftItem()];
}

export function checklistDepth(item: ChecklistDraftItem): 0 | 1 {
  return item.parentId === null ? 0 : 1;
}

function rootBlock(items: ChecklistDraftItem[], rootIndex: number): ChecklistDraftItem[] {
  const root = items[rootIndex];
  if (!root || root.parentId !== null) return root ? [root] : [];
  const block = [root];
  for (let index = rootIndex + 1; index < items.length; index += 1) {
    const candidate = items[index];
    if (!candidate || candidate.parentId === null) break;
    if (candidate.parentId === root.id) block.push(candidate);
  }
  return block;
}

function swap(items: ChecklistDraftItem[], a: number, b: number): ChecklistDraftItem[] {
  const next = [...items];
  const first = next[a];
  const second = next[b];
  if (!first || !second) return items;
  next[a] = second;
  next[b] = first;
  return next;
}
