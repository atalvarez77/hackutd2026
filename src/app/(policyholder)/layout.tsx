import { ModeBar } from '@/components/ui/ModeBar';
import { PolicyNav } from '@/components/ui/PolicyNav';

export default function PolicyholderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-charcoal">
      <a href="#main" className="hn-skip">Skip to main content</a>
      <ModeBar mode="policyholder" />
      <PolicyNav />
      <main id="main" tabIndex={-1} className="flex-1 flex flex-col outline-none">{children}</main>
    </div>
  );
}
