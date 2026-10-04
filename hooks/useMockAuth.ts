import { useState, useEffect } from 'react';

type User = { id: string; name: string; email?: string } | null;

export function useMockAuth() {
  const [user, setUser] = useState<User>(() => {
    try { return JSON.parse(localStorage.getItem('mock_user') || 'null'); } catch { return null; }
  });

  useEffect(() => {
    if (user) localStorage.setItem('mock_user', JSON.stringify(user));
    else localStorage.removeItem('mock_user');
  }, [user]);

  async function login(username: string) {
    const res = await fetch('/api/auth/mock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setUser(data.user);
    localStorage.setItem('mock_token', data.token);
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('mock_token');
  }

  return { user, login, logout };
}
