// import type { NextApiRequest, NextApiResponse } from 'next';

// export default function handler(req: NextApiRequest, res: NextApiResponse) {
//   // Simple mock login: accept any username/password for dev
//   if (req.method === 'POST') {
//     const { username } = req.body;
//     const token = `mock-token-${username || 'anon'}`;
//     return res.status(200).json({ user: { id: 'user_1', name: username || 'Demo' }, token });
//   }
//   res.status(405).end();
// }


import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username } = req.body || {};
  const user = { id: 'user_demo', name: username || 'Demo User', email: `${username || 'demo'}@example.com` };
  const token = `mock-token-${user.id}`;
  return res.status(200).json({ user, token });
}

