'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, UserCheck, LayoutDashboard, Home, RotateCcw } from 'lucide-react';
import { useStore } from '@/context/StateFarmContext';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { customers, activeCustomer, setActiveCustomerId, resetToDefaults } = useStore();

  const highRiskCount = customers.filter((c) => c.urgency === 'High').length;
  const pendingDraftsCount = customers.filter((c) => c.claimDraft.status === 'drafted').length;

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-600/30 group-hover:bg-red-500 transition-colors">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight">State Farm</span>
              <span className="text-xs bg-red-600/30 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
                Good Neighbor SafetyNet
              </span>
            </div>
            <p className="text-xs text-slate-400">Proactive Welfare & Automated Claims</p>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
          <Link
            href="/"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === '/' ? 'bg-red-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Home className="w-4 h-4" />
            Home / Overview
          </Link>
          <Link
            href="/customer"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === '/customer' ? 'bg-red-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Customer Portal
          </Link>
          <Link
            href="/agent"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
              pathname === '/agent' ? 'bg-red-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Agent Dashboard
            {pendingDraftsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
                {pendingDraftsCount}
              </span>
            )}
          </Link>
        </nav>

        {/* Active Customer Switcher & Reset */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-xs text-slate-400">Simulated Policyholder:</span>
            <select
              value={activeCustomer.id}
              onChange={(e) => setActiveCustomerId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-red-500 cursor-pointer"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.age}yo, {c.language.toUpperCase()}) - Risk: {c.riskScore}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              if (confirm('Reset all mock customer data and state to defaults?')) {
                resetToDefaults();
              }
            }}
            title="Reset Mock Data"
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

