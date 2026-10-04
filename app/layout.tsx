import './globals.css';
import { ReactNode } from 'react';
import ChatbotWidget from '../components/ui/ChatbotWidget.tsx';

export const metadata = {
  title: 'Adibank Clone',
  description: 'Demo banking app with AI assistant',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <h1 className="text-lg font-semibold">Adibank Clone</h1>
            </div>
          </header>

          <main className="flex-1 max-w-7xl mx-auto px-4 py-6">{children}</main>

          <footer className="bg-white border-t">
            <div className="max-w-7xl mx-auto px-4 py-4 text-sm text-slate-500">© Demo</div>
          </footer>
        </div>

        <ChatbotWidget />
      </body>
    </html>
  );
}

