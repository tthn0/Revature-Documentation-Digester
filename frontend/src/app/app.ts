import {
  afterRenderEffect,
  ApplicationRef,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { remixArrowLeftUpLongLine } from '@ng-icons/remixicon';
import { lucideMoon, lucideRotateCcw, lucideSearch, lucideSun, lucidePlus } from '@ng-icons/lucide';
import { ThemeService } from './services/theme';
import { HttpService, RagResponse, SearchResponse } from './services/http-service';
import { phosphorPencilSimpleBold } from '@ng-icons/phosphor-icons/bold';
import { phosphorCopyBold } from '@ng-icons/phosphor-icons/bold';
import { remixWindow2Line, remixDeleteBinLine } from '@ng-icons/remixicon';
import { matDocsOutline } from '@ng-icons/material-symbols/outline';

interface QA {
  question: string;
  answer?: RagResponse;
  /** Transient: failed turns and pending uploads are never persisted. */
  error?: string;
  file?: File;
}

interface Chat {
  id: string;
  title: string;
  messages: QA[];
}

const PHRASES = [
  'Loading Shaders',
  'Downloading Battle Pass',
  'Summoning Bosses',
  'Loading Skins',
  'Generating the Terrain',
  'Selecting Map',
  'Forming Squad',
  'Respawning NPCs',
  'Compiling Loot Tables',
  'Matchmaking',
  'Initializing Physics Engine',
  'Bypassing In-Game Purchases',
  'Hacking the Mainframe',
  'Joining Party',
  'Downloading More RAM',
  'Emulating Console',
  'Clearing Inventory',
  'Clocking Gauge',
  'Calculating Pity',
];

const readChats = (): Chat[] => {
  try {
    const chats = JSON.parse(localStorage.getItem('chats') ?? '[]');
    return Array.isArray(chats) ? chats : [];
  } catch {
    return []; // corrupted or unavailable storage
  }
};

const writeChats = (chats: Chat[]): void => {
  try {
    localStorage.setItem('chats', JSON.stringify(chats));
  } catch {
    // quota exceeded / storage blocked: chats stay in memory only
  }
};

@Component({
  imports: [RouterOutlet, NgIcon],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  providers: [
    provideIcons({
      remixArrowLeftUpLongLine,
      lucideRotateCcw,
      lucideMoon,
      lucideSun,
      phosphorPencilSimpleBold,
      phosphorCopyBold,
      remixWindow2Line,
      lucidePlus,
      lucideSearch,
      remixDeleteBinLine,
      matDocsOutline,
    }),
  ],
})
export class App {
  protected readonly navigator = navigator;
  protected readonly theme = inject(ThemeService);
  private appRef = inject(ApplicationRef);
  private http = inject(HttpService);
  text = '';
  chats = signal<Chat[]>(readChats());
  chatId = sessionStorage.getItem('chatId') ?? crypto.randomUUID();
  messages = signal<QA[]>(this.chats().find((c) => c.id === this.chatId)?.messages ?? []);
  historyOpen = signal(false);
  searchOpen = signal(false);
  searchResult = signal<SearchResponse | null>(null);
  searchError = signal('');
  loading = signal(false);
  chat = viewChild<ElementRef<HTMLElement>>('chat');

  status = signal('');

  constructor() {
    sessionStorage.setItem('chatId', this.chatId);
    // typewriter: type a phrase left to right, hold, erase right to left, next phrase
    effect((onCleanup) => {
      if (!this.loading()) return;
      let i = Math.floor(Math.random() * PHRASES.length),
        n = 0,
        dir = 1,
        hold = 0;
      const t = setInterval(() => {
        if (hold-- > 0) return;
        n += dir;
        const phrase = `${PHRASES[i]}...`;
        this.status.set(phrase.slice(0, n));
        if (n === phrase.length) [dir, hold] = [-1, 12];
        else if (n === 0)
          [dir, i] = [
            1,
            (i + 1 + Math.floor(Math.random() * (PHRASES.length - 1))) % PHRASES.length,
          ];
      }, 70);
      onCleanup(() => {
        clearInterval(t);
        this.status.set('');
      });
    });
    effect(() => {
      if (this.loading()) return; // don't write storage on every streamed token
      // only answered turns are stored: errors and in-flight questions are transient
      const messages = this.messages()
        .filter((m) => m.answer)
        .map(({ question, answer }) => ({ question, answer }));
      if (!messages.length) return; // never store empty chats
      // re-read first so a second tab's chats aren't overwritten
      const others = readChats().filter((c) => c.id !== this.chatId);
      const all = [
        { id: this.chatId, title: messages[0].question.slice(0, 15), messages },
        ...others,
      ];
      writeChats(all);
      this.chats.set(all);
    });
    afterRenderEffect(() => {
      this.messages();
      const el = this.chat()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async toggleTheme(e: MouseEvent): Promise<void> {
    const swap = () => {
      this.theme.toggle();
      this.appRef.tick();
    };
    if (!document.startViewTransition) return swap();
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(swap);
    await vt.ready;
    document.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 800, easing: 'ease-in', pseudoElement: '::view-transition-new(root)' },
    );
  }

  newChat(): void {
    this.openChat(crypto.randomUUID(), []);
  }

  deleteChat(id: string): void {
    if (id === this.chatId) {
      if (this.loading()) return;
      this.chatId = crypto.randomUUID();
      sessionStorage.setItem('chatId', this.chatId);
      this.messages.set([]);
    }
    const all = readChats().filter((c) => c.id !== id);
    writeChats(all);
    this.chats.set(all);
  }

  openChat(id: string, messages: QA[]): void {
    if (this.loading()) return;
    this.chatId = id;
    sessionStorage.setItem('chatId', id);
    this.messages.set(messages);
    this.historyOpen.set(false);
  }

  file = signal<File | null>(null);

  pick(input: HTMLInputElement): void {
    this.file.set(input.files?.[0] ?? null);
    input.value = '';
  }

  onInput(event: Event): void {
    const element = event.target as HTMLTextAreaElement;
    this.text = element.value;
  }

  onEnter(e: Event, box: HTMLTextAreaElement): void {
    const k = e as KeyboardEvent;
    if (k.shiftKey || k.isComposing) return;
    e.preventDefault();
    if (this.loading()) return;
    this.submit();
    box.value = '';
  }

  async submit(): Promise<void> {
    if (this.searchOpen()) {
      await this.runSearch();
      return;
    }
    const question = this.text.trim();
    this.text = '';
    const file = this.file();
    if (!question || this.loading()) return;
    this.file.set(null);
    this.messages.update((m) => [...m, { question, file: file ?? undefined }]);
    await this.run(this.messages().length - 1);
  }

  /** Re-run the turn at index `i` in place, replacing its previous answer or error. */
  async retry(i: number): Promise<void> {
    if (this.loading()) return;
    this.patch(i, { answer: undefined, error: undefined });
    await this.run(i);
  }

  private patch(i: number, p: Partial<QA>): void {
    this.messages.update((m) => m.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  private async runSearch(): Promise<void> {
    const question = this.text.trim();
    if (!question || this.loading()) return;
    this.text = '';
    this.loading.set(true);
    this.searchError.set('');
    try {
      this.searchResult.set(await this.http.search(question));
    } catch (e) {
      this.searchResult.set(null);
      this.searchError.set(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }

  private async run(i: number): Promise<void> {
    this.loading.set(true);
    const chatId = this.chatId; // captured: the user may switch chats while this streams
    try {
      const { question, file } = this.messages()[i];
      if (file) {
        await this.http.upload(file);
        this.patch(i, { file: undefined }); // uploaded once; retries skip it
      }
      let sources: RagResponse['sources'] = []; // shown only once the stream is done
      await this.http.askStream(question, chatId, ({ event, data }) => {
        const cur = this.messages()[i].answer ?? { response: '', sources: [] };
        if (event === 'sources') sources = data.sources;
        else if (event === 'token') this.patch(i, { answer: { ...cur, response: cur.response + data.token } });
        else this.patch(i, { answer: { ...cur, sources } });
      });
    } catch (e) {
      // answer cleared so a half-streamed reply is neither shown nor persisted
      this.patch(i, { answer: undefined, error: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      this.loading.set(false);
    }
  }
}
