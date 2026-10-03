import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple mock login: accept any username/password for dev
  if (req.method === 'POST') {
    const { username } = req.body;
    const token = `mock-token-${username || 'anon'}`;
    return res.status(200).json({ user: { id: 'user_1', name: username || 'Demo' }, token });
  }
  res.status(405).end();
}
