'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/StateFarmContext';
import { Logo } from '@/components/brand/Logo';
import { initials } from '@/lib/hn';

const TABS = [
  { href: '/', en: 'Home', es: 'Inicio' },
  { href: '/customer', en: 'My Portal', es: 'Mi portal' },
  { href: '/customer/claim', en: 'File a claim', es: 'Reclamo' },
];

export function PolicyNav() {
  const pathname = usePathname();
  const { customers, activeCustomer, setActiveCustomerId, updateCustomerLanguage } = useStore();
  const lang = activeCustomer.language;

  return (
    <>
      {/* Utility strip */}
      <div className="bg-charcoal text-white">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] py-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-sf-red" />
            {activeCustomer.weatherAlert.title} · {activeCustomer.city}
          </span>
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-[#B4A9BC]">
            <span className="hn-label text-[10px]">Demo · acting as</span>
            <select
              value={activeCustomer.id}
              onChange={(e) => setActiveCustomerId(e.target.value)}
              className="h-[30px] px-2 rounded-md border border-grey bg-charcoal text-white font-semibold text-[13px]"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <header className="sticky top-0 z-20 bg-white border-b border-charcoal/12">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] min-h-[76px] flex flex-wrap items-center gap-x-6">
          <Link href="/" className="flex-none no-underline">
            <Logo />
          </Link>
          <nav className="hn-scroll-x order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-stretch h-[60px] md:h-[76px] gap-0.5 min-w-0">
            {TABS.map((t) => {
              const active = t.href === pathname;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex items-center px-2.5 font-bold text-base whitespace-nowrap no-underline border-b-4 transition-colors ${
                    active ? 'border-sf-red' : 'border-transparent hover:border-petal'
                  }`}
                >
                  {lang === 'es' ? t.es : t.en}
                </Link>
              );
            })}
          </nav>
          <div className="order-2 md:order-3 ml-auto flex items-center gap-2.5 py-3 md:py-0">
            <div className="flex p-[3px] rounded-full bg-petal-50">
              {(['en', 'es'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => updateCustomerLanguage(activeCustomer.id, l)}
                  className="h-[38px] min-w-12 rounded-full font-bold text-sm cursor-pointer"
                  style={{ background: lang === l ? '#1A1A1A' : 'transparent', color: lang === l ? '#fff' : '#474954' }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="w-11 h-11 rounded-full bg-charcoal text-white flex items-center justify-center font-display font-black text-[17px]">
              {initials(activeCustomer.name)}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}
