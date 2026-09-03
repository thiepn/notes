import { searchDocuments, type SearchDocument } from './searchEngine';
import type { SearchFilters } from './searchTypes';

export interface SearchWorkerMatch {
  noteId: string;
  score: number;
}

interface PendingSearch {
  query: string;
  filters: SearchFilters;
  resolve(matches: SearchWorkerMatch[]): void;
}

interface SearchWorkerResponse {
  type: 'search-results';
  requestId: number;
  matches: SearchWorkerMatch[];
}

export class SearchWorkerClient {
  private worker: Worker | null = null;
  private readonly fallbackDocuments = new Map<string, SearchDocument>();
  private readonly pending = new Map<number, PendingSearch>();
  private requestSequence = 0;

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
        type: 'module',
        name: 'notes-search',
      });
      this.worker.addEventListener('message', this.handleMessage);
      this.worker.addEventListener('error', this.handleWorkerFailure);
      this.worker.addEventListener('messageerror', this.handleWorkerFailure);
    } catch {
      this.worker = null;
    }
  }

  replaceIndex(documents: SearchDocument[]): void {
    this.fallbackDocuments.clear();
    for (const document of documents) this.fallbackDocuments.set(document.note.id, document);
    this.worker?.postMessage({ type: 'replace-index', documents });
  }

  upsertDocument(document: SearchDocument): void {
    this.fallbackDocuments.set(document.note.id, document);
    this.worker?.postMessage({ type: 'upsert-document', document });
  }

  removeDocument(noteId: string): void {
    this.fallbackDocuments.delete(noteId);
    this.worker?.postMessage({ type: 'remove-document', noteId });
  }

  search(query: string, filters: SearchFilters): Promise<SearchWorkerMatch[]> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(this.searchFallback(query, filters));

    const requestId = ++this.requestSequence;
    return new Promise((resolve) => {
      this.pending.set(requestId, { query, filters, resolve });
      worker.postMessage({ type: 'search', requestId, query, filters });
    });
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.removeEventListener('message', this.handleMessage);
      worker.removeEventListener('error', this.handleWorkerFailure);
      worker.removeEventListener('messageerror', this.handleWorkerFailure);
      worker.terminate();
    }
    this.resolvePendingWithFallback();
  }

  private readonly handleMessage = (event: MessageEvent<SearchWorkerResponse>) => {
    const message = event.data;
    if (message?.type !== 'search-results') return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    pending.resolve(message.matches);
  };

  private readonly handleWorkerFailure = () => {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
    this.resolvePendingWithFallback();
  };

  private resolvePendingWithFallback(): void {
    for (const pending of this.pending.values()) {
      pending.resolve(this.searchFallback(pending.query, pending.filters));
    }
    this.pending.clear();
  }

  private searchFallback(query: string, filters: SearchFilters): SearchWorkerMatch[] {
    return searchDocuments([...this.fallbackDocuments.values()], query, filters).map((result) => ({
      noteId: result.document.note.id,
      score: result.score,
    }));
  }
}
