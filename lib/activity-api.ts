import 'server-only';
import { getViewer } from '@/lib/auth/session';
import { recordActivity } from '@/lib/activity';

export function withActivity(handler: (request: Request) => Promise<Response>) {
  return async (request = new Request('http://internal/api')) => {
    const response = await handler(request);
    try {
      const viewer = await getViewer();
      if (viewer) {
        const path = new URL(request.url).pathname;
        const type = path.endsWith('/transfer') ? 'transfer.request' : path.includes('/assistant/') || path.includes('/openai/') ? 'assistant.request'
          : path.includes('/analytics') ? 'analytics.view' : path.endsWith('/revision') ? 'data.refresh_check'
          : path.endsWith('/accounts') ? 'accounts.view' : path.endsWith('/transactions') ? 'transactions.view'
          : path.endsWith('/manage') ? 'banking.request' : path.endsWith('/banking') ? 'banking.view' : 'api.request';
        await recordActivity(viewer.id, type, { summary: `${request.method} ${path}`, status: response.status });
      }
    } catch { console.error('activity_request_context_failed'); }
    return response;
  };
}
