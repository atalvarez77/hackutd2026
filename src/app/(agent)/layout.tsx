import { ModeBar } from '@/components/ui/ModeBar';

/** Agent mode: dark "mission control", desktop only (min-width 1440). */
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen min-w-[1440px] flex flex-col bg-void text-ink">
      <a href="#main" className="hn-skip">Skip to main content</a>
      <ModeBar mode="agent" />
      <main id="main" tabIndex={-1} className="flex-1 min-h-0 flex flex-col outline-none">
        {children}
      </main>
    </div>
  );
}
