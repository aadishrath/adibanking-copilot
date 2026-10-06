import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import ChatbotWidget from '@/components/ui/ChatbotWidget';
import Navbar from '@/components/layout/Navbar';
import ActivityTracker from '@/components/layout/ActivityTracker';
import { getViewer } from '@/lib/auth/session';
import { canAccess } from '@/lib/auth/roles';

export const metadata = {
  title: 'AdiBank',
  description: 'Demo banking app with AI assistant',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-visual' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <Navbar key={`navbar:${viewer?.id ?? 'guest'}`} viewer={viewer} />
          {viewer && <ActivityTracker key={`activity:${viewer.id}`}/>}

          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>

          <footer className="bg-white border-t">
            <div className={`mx-auto max-w-7xl px-4 pt-4 text-center text-sm text-slate-500 sm:px-6 ${viewer?'pb-24':'pb-4'}`}>© {new Date().getFullYear()} aadish. Built by aadish. For demonstration purposes only.</div>
          </footer>
        </div>

        {viewer && canAccess(viewer.role, 'assistant') && <ChatbotWidget key={`assistant:${viewer.id}`} userId={viewer.id} />}
      </body>
    </html>
  );
}

