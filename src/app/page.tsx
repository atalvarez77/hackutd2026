'use client';

import React from 'react';
import Link from 'next/link';
import { UserCheck, LayoutDashboard, Zap, ArrowRight, AlertTriangle } from 'lucide-react';
import { useStore } from '@/context/StateFarmContext';

export default function HomePage() {
  const { customers, setActiveCustomerId } = useStore();

  return (
    <div className="flex flex-col flex-1 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 py-16 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-red-600/15 border border-red-500/30 text-red-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
            <Zap className="w-4 h-4 text-red-500 animate-pulse" />
            State Farm Good Neighbor SafetyNet
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
            Proactive Welfare & <span className="text-red-500">Automated Hazard Response</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
            Protecting vulnerable policyholders during extreme weather with AI welfare checks, real-time risk triage, and 1-click claim pre-filing.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/customer" className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white font-semibold px-8 py-4 rounded-xl shadow-lg">
              <UserCheck className="w-5 h-5" /> Launch Customer Portal <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/agent" className="flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold px-8 py-4 rounded-xl shadow-lg">
              <LayoutDashboard className="w-5 h-5 text-red-400" /> Agent Priority Triage
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white">⚡ Quick Judge Demo Scenarios</h2>
          <p className="mt-2 text-sm text-slate-400">Select any pre-seeded profile to test the customer check-in or agent triage workflow:</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {customers.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveCustomerId(c.id)}
              className="bg-slate-900 border border-slate-800 hover:border-red-500/50 p-6 rounded-2xl cursor-pointer transition-all shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <img src={c.avatarUrl} alt={c.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-700" />
                  <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${c.urgency === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : c.urgency === 'Medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    Risk: {c.riskScore}
                  </span>
                </div>
                <h4 className="font-bold text-lg text-white">{c.name}</h4>
                <p className="text-xs text-slate-400">{c.age}yo • {c.livesAlone ? 'Alone' : 'Family'} • {c.language.toUpperCase()}</p>
                <p className="mt-3 text-xs text-red-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {c.detectedHazard}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                <span>{c.weatherAlert.title}</span>
                <span className="text-red-400 font-semibold group-hover:underline">Test Portal &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

