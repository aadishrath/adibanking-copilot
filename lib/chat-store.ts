import { transferProposalSchema, type TransferProposal } from '@/lib/assistant-schema';
export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; proposal?: TransferProposal; transferStatus?: 'pending' | 'uncertain' | 'completed' | 'cancelled' };
const EMPTY: ChatMessage[] = [];
const LIMIT = 100;

export function chatStorageKey(userId: string) { return `adibank_chat_v2:${userId}`; }

export function parseChatHistory(raw: string | null): ChatMessage[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value.filter((item): item is ChatMessage => Boolean(item && typeof item === 'object'
      && typeof item.id === 'string' && item.id.length <= 100
      && (item.role === 'user' || item.role === 'assistant')
      && typeof item.text === 'string' && item.text.length <= 8000
      && (!item.proposal || (item.role === 'assistant' && transferProposalSchema.safeParse(item.proposal).success))
      && (!item.transferStatus || ['pending','uncertain','completed','cancelled'].includes(item.transferStatus)))).slice(-LIMIT);
  } catch { return EMPTY; }
}

function browserStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function createChatStore(userId: string, storage = browserStorage) {
  const key = chatStorageKey(userId);
  let cached: ChatMessage[] = EMPTY;
  let previousRaw: string | null | undefined;
  let memoryOnly = false;
  const listeners = new Set<() => void>();
  function getSnapshot() {
    if (memoryOnly) return cached;
    try {
      const target = storage();
      if (!target) { memoryOnly = true; return cached; }
      const raw = target.getItem(key);
      if (raw !== previousRaw) { previousRaw = raw; cached = parseChatHistory(raw); }
    } catch { memoryOnly = true; }
    return cached;
  }
  function save(messages: ChatMessage[]) {
    cached = messages.slice(-LIMIT);
    previousRaw = JSON.stringify(cached);
    try {
      const target = storage();
      if (target) target.setItem(key, previousRaw);
      else memoryOnly = true;
    } catch { memoryOnly = true; }
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot,
    getServerSnapshot: () => EMPTY,
    append(message: ChatMessage) { save([...getSnapshot(), message]); },
    update(id: string, changes: Partial<Pick<ChatMessage, 'text' | 'transferStatus'>>) { save(getSnapshot().map(message => message.id === id ? { ...message, ...changes } : message)); },
    clear() { save(EMPTY); },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => { listeners.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
    },
  };
}
