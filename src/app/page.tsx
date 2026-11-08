'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserCheck, LayoutDashboard, Zap, ArrowRight, ShieldCheck, Phone, Mail, MapPin } from 'lucide-react';
import { useStore } from '@/context/StateFarmContext';

export default function HomePage() {
  const { customers, setActiveCustomerId } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
            Powered by NVIDIA Nemotron Real-Time Triage. Zero pre-baked damage or risk scores—every assessment is dynamically generated from live policyholder conversations.
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

      {/* Clean Customer Directory (No pre-baked risk or damage) */}
      <div className="max-w-7xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white">Policyholder Directory</h2>
          <p className="mt-2 text-sm text-slate-400">Select any clean-slate customer profile to start a live check-in:</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mounted && customers.map((c) => (
            <Link
              key={c.id}
              href="/customer"
              onClick={() => setActiveCustomerId(c.id)}
              className="bg-slate-900 border border-slate-800 hover:border-red-500/50 p-6 rounded-2xl cursor-pointer transition-all shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <img src={c.avatarUrl} alt={c.name} className="w-14 h-14 rounded-full object-cover border-2 border-slate-700 group-hover:border-red-500 transition-colors" />
                  <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-medium">
                    {c.language.toUpperCase()} Speaker
                  </span>
                </div>
                <h4 className="font-bold text-lg text-white">{c.name}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{c.age} yrs old • {c.livesAlone ? 'Lives Alone' : 'Family'}</p>
                <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-300 space-y-1.5">
                  <p className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-red-400" /> {c.policy.type}</p>
                  <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {c.city}, {c.state}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-amber-400 font-medium">Status: {c.checkInStatus}</span>
                <span className="text-red-400 font-semibold group-hover:underline">Start Check-In &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}



