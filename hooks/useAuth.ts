import { useState } from 'react';
type User = { id: string; name: string };

export function useMockAuth() {
  const [user, setUser] = useState<User | null>(null);
  async function login(username: string) {
    const res = await fetch('/api/auth/mock', { method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username })});
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
