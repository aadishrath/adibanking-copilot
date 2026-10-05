import { describe, test, expect } from '@jest/globals';
import { createChatStore, parseChatHistory, chatStorageKey } from '@/lib/chat-store';

describe('chat storage', () => {
  test('rejects corrupt and invalid records and limits retention', () => {
    expect(parseChatHistory('{bad')).toEqual([]);
    expect(parseChatHistory('{"text":"not an array"}')).toEqual([]);
    expect(parseChatHistory('[{"id":"x","role":"admin","text":"bad"}]')).toEqual([]);
    const rows = Array.from({ length: 150 }, (_, i) => ({ id: String(i), role: 'user', text: 'hello' }));
    expect(parseChatHistory(JSON.stringify(rows))).toHaveLength(100);
  });
  test('keeps stable snapshots and isolates users', () => {
    const storage = new Map<string, string>();
    const target = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } as unknown as Storage;
    const a = createChatStore('a', () => target);
    const b = createChatStore('b', () => target);
    a.append({ id: '1', role: 'user', text: 'Private message' });
    expect(a.getSnapshot()).toBe(a.getSnapshot());
    expect(b.getSnapshot()).toEqual([]);
    expect(a.getServerSnapshot()).toEqual([]);
    expect(storage.has(chatStorageKey('a'))).toBe(true);
    a.clear();
    expect(a.getSnapshot()).toEqual([]);
  });
  test('works in memory when storage access or writes fail', () => {
    const store = createChatStore('blocked', () => { throw new Error('storage blocked'); });
    store.append({ id: '1', role: 'user', text: 'Still works' });
    expect(store.getSnapshot()[0].text).toBe('Still works');
    const quota = createChatStore('quota', () => ({ getItem: () => null, setItem: () => { throw new Error('quota'); } }) as unknown as Storage);
    quota.append({ id: '2', role: 'user', text: 'Retained' });
    expect(quota.getSnapshot()[0].text).toBe('Retained');
  });
});
