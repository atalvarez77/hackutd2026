import { ModeBar } from '@/components/ui/ModeBar';
import { PolicyNav } from '@/components/ui/PolicyNav';

export default function PolicyholderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-charcoal">
      <ModeBar mode="policyholder" />
      <PolicyNav />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
