import type { Metadata } from 'next';
import { Kanit, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google';
import './globals.css';
import { StateFarmProvider } from '@/context/StateFarmContext';

const kanit = Kanit({
  variable: '--font-kanit',
  subsets: ['latin'],
  weight: ['700', '900'],
  style: ['normal', 'italic'],
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: 'HeyNeighbor · We knock first.',
  description: 'Nora, State Farm’s AI neighbor: proactive welfare calls, risk triage and pre-filed claims during extreme weather.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${kanit.variable} ${jakarta.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <StateFarmProvider>{children}</StateFarmProvider>
      </body>
    </html>
  );
}
