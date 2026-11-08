import type { Metadata } from 'next';
import { Source_Sans_3 } from 'next/font/google';
import './globals.css';
import { StateFarmProvider } from '@/context/StateFarmContext';

// One plain, readable family for everything (closer to State Farm's own site than a display face).
const sans = Source_Sans_3({
  variable: '--font-sans-base',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'HeyNeighbor · We knock first.',
  description: 'Nora, State Farm’s AI neighbor: proactive welfare calls, risk triage and pre-filed claims during extreme weather.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <StateFarmProvider>{children}</StateFarmProvider>
      </body>
    </html>
  );
}
