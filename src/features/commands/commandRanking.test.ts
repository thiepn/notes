import { describe, expect, it } from 'vitest';

import { rankCommandCandidates, type CommandSearchCandidate } from './commandRanking';

interface TestCommand extends CommandSearchCandidate {
  id: string;
}

const commands: TestCommand[] = [
  {
    id: 'new-note',
    label: 'New text note',
    description: 'Start typing immediately',
    group: 'Create',
    keywords: ['capture', 'note'],
  },
  {
    id: 'archive',
    label: 'Open Archive',
    description: 'Browse archived notes',
    group: 'Navigate',
    keywords: ['archived'],
  },
  {
    id: 'backup',
    label: 'Backup, restore, and import',
    description: 'Export or recover notes',
    group: 'Navigate',
    keywords: ['google keep takeout'],
  },
];

describe('rankCommandCandidates', () => {
  it('keeps catalog order when the query is empty', () => {
    expect(rankCommandCandidates(commands, '').map(({ item }) => item.id)).toEqual([
      'new-note',
      'archive',
      'backup',
    ]);
  });

  it('ranks exact and prefix label matches ahead of weaker metadata matches', () => {
    const ranked = rankCommandCandidates(commands, 'archive');
    expect(ranked[0]?.item.id).toBe('archive');
  });

  it('matches across multiple words and metadata', () => {
    const ranked = rankCommandCandidates(commands, 'google import');
    expect(ranked.map(({ item }) => item.id)).toEqual(['backup']);
  });

  it('tolerates a small typo for longer terms', () => {
    const ranked = rankCommandCandidates(commands, 'archvie');
    expect(ranked[0]?.item.id).toBe('archive');
  });

  it('does not admit candidates when one query term is unrelated', () => {
    expect(rankCommandCandidates(commands, 'archive banana')).toEqual([]);
  });
});
