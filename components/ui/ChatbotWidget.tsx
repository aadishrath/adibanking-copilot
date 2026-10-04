'use client';

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; text: string; id: string };

const STORAGE_KEY = 'ai_chat_history_v1';

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    listRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [messages]);

  function addMessage(role: Msg['role'], text: string) {
    setMessages(prev => [...prev, { role, text, id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt) return;
    addMessage('user', prompt);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const json = await res.json();
      if (!res.ok) {
        addMessage('assistant', `Error: ${json?.error ?? 'Unknown error'}`);
      } else {
        addMessage('assistant', json.assistant ?? 'No response');
      }
    } catch (err) {
      addMessage('assistant', 'Network error contacting AI');
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9999 }}>
      <div style={{ width: 360, boxShadow: '0 8px 24px rgba(2,6,23,0.2)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: 10, background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>AI Assistant</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => { clearHistory(); }} title="Clear history" style={{ color: '#fff', background: 'transparent', border: 'none' }}>🗑</button>
            <button onClick={() => setOpen(o => !o)} style={{ color: '#fff', background: 'transparent', border: 'none' }}>{open ? '−' : '+'}</button>
          </div>
        </div>

        {open && (
          <div style={{ maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
            <div ref={listRef} style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {messages.length === 0 && <div className="text-slate-500">Ask me anything about the app or your data.</div>}
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 10, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: m.role === 'user' ? '#e6eef8' : '#0ea5a4',
                    color: m.role === 'assistant' ? '#fff' : '#0f172a'
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 8, borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask me anything..."
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
                disabled={loading}
              />
              <button onClick={send} disabled={loading} style={{ padding: '8px 12px', borderRadius: 8, background: '#0f172a', color: '#fff' }}>
                {loading ? '...' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
