'use client';
import React, { useState, useEffect, useRef } from 'react';

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role:'user'|'assistant', text:string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('chat_history') || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('chat_history', JSON.stringify(messages)); }, [messages]);

  async function send() {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    try {
      const res = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ prompt: input, sessionId: 'local-session' })
      });
      const data = await res.json();
      const assistantText = data?.choices?.[0]?.message?.content ?? 'No response';
      setMessages(prev => [...prev, { role: 'assistant', text: assistantText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error contacting AI' }]);
    }
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9999 }}>
      <div style={{ width: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: 8, background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>AI Assistant</strong>
          <button onClick={() => setOpen(o => !o)} style={{ color: '#fff' }}>{open ? '−' : '+'}</button>
        </div>
        {open && (
          <div style={{ maxHeight: 420, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {messages.map((m, i) => <div key={i} style={{ marginBottom: 8, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 12, background: m.role === 'user' ? '#e2e8f0' : '#0ea5a4', color: m.role === 'assistant' ? '#fff' : '#000' }}>{m.text}</div>
              </div>)}
            </div>
            <div style={{ padding: 8, borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask me anything..." style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
              <button onClick={send} style={{ padding: '8px 12px', borderRadius: 8, background: '#0f172a', color: '#fff' }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
