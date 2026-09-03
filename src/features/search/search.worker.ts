import { searchDocuments, type SearchDocument } from './searchEngine';
import type { SearchFilters } from './searchTypes';

interface SearchWorkerMatch {
  noteId: string;
  score: number;
}

type SearchWorkerRequest =
  | { type: 'replace-index'; documents: SearchDocument[] }
  | { type: 'upsert-document'; document: SearchDocument }
  | { type: 'remove-document'; noteId: string }
  | { type: 'search'; requestId: number; query: string; filters: SearchFilters };

interface SearchWorkerResponse {
  type: 'search-results';
  requestId: number;
  matches: SearchWorkerMatch[];
}

const documents = new Map<string, SearchDocument>();

self.addEventListener('message', (event: MessageEvent<SearchWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'replace-index') {
    documents.clear();
    for (const document of message.documents) documents.set(document.note.id, document);
    return;
  }
  if (message.type === 'upsert-document') {
    documents.set(message.document.note.id, message.document);
    return;
  }
  if (message.type === 'remove-document') {
    documents.delete(message.noteId);
    return;
  }

  const matches = searchDocuments([...documents.values()], message.query, message.filters).map(
    (result) => ({ noteId: result.document.note.id, score: result.score }),
  );
  const response: SearchWorkerResponse = {
    type: 'search-results',
    requestId: message.requestId,
    matches,
  };
  self.postMessage(response);
});
