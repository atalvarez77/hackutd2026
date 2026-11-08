import { ModeBar } from '@/components/ui/ModeBar';

/** Agent mode: dark "mission control", desktop only (min-width 1440). */
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen min-w-[1440px] flex flex-col bg-void text-ink">
      <ModeBar mode="agent" />
      {children}
    </div>
  );
}
