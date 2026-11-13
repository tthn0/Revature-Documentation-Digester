import { Service } from '@angular/core';

export interface Source {
  filename: string;
  page: string;
  chunk_index: string;
  content: string;
}

export interface RagResponse {
  response: string;
  sources: Source[];
}

export interface UserStoryHit {
  user_story_id: string;
  title: string;
  text: string;
}

export interface SearchResponse {
  documents: Source[];
  user_stories: UserStoryHit[];
}

// ponytail: hardcoded backend URL, move to environment config when deploying
const BASE = 'http://localhost:8000/documents';

async function post(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(BASE + path, { method: 'POST', ...init });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`);
  }
  return res;
}

const send = async <T>(path: string, init: RequestInit): Promise<T> => (await post(path, init)).json();

export type StreamEvent =
  | { event: 'sources'; data: { sources: Source[] } }
  | { event: 'token'; data: { token: string } }
  | { event: 'done'; data: object };

@Service()
export class HttpService {
  /** Document chunks and user stories for one question. */
  search(question: string, k = 5): Promise<SearchResponse> {
    return send('/search', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, k }),
    });
  }

  /** Resolves once the backend has embedded the document. */
  upload(file: File): Promise<unknown> {
    const body = new FormData();
    body.append('file', file);
    return send('/upload', { body });
  }

  /** Reads the SSE stream from /ask/stream/memory (chatId = backend thread_id), calling `onEvent` per event. */
  async askStream(prompt: string, chatId: string, onEvent: (e: StreamEvent) => void): Promise<void> {
    const res = await post('/ask/stream/memory', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, thread_id: chatId }),
    });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    let finished = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        if (!finished) throw new Error('The answer stream ended unexpectedly.');
        return;
      }
      buf += value;
      const frames = buf.split(/\r?\n\r?\n/);
      buf = frames.pop()!;
      for (const f of frames) {
        const line = (name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(f)?.[1];
        const event = line('event'), data = line('data');
        if (event === 'done') finished = true;
        if (event && data) onEvent({ event, data: JSON.parse(data) } as StreamEvent);
      }
    }
  }
}
