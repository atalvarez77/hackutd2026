'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { LayoutDashboard, AlertTriangle, CheckCircle, FileText, ChevronRight, X, Shield, Phone } from 'lucide-react';

export default function AgentDashboardPage() {
  const { customers, approveClaimDraft } = useStore();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [filterUrgency, setFilterUrgency] = useState<string>('All');

  const sorted = [...customers].sort((a, b) => b.riskScore - a.riskScore);
  const filtered = sorted.filter((c) => {
    if (filterUrgency === 'All') return true;
    if (filterUrgency === 'High') return c.urgency === 'High';
    if (filterUrgency === 'Drafts') return c.claimDraft?.status === 'drafted';
    return true;
  });

  const selected = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="flex flex-col flex-1 bg-slate-950 text-slate-100 max-w-7xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-red-500" />
            Agent Priority Triage Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">Real-time risk scoring, explainability, and 1-click claim approvals.</p>
        </div>

        <div className="flex gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          {['All', 'High', 'Drafts'].map((f) => (
            <button key={f} onClick={() => setFilterUrgency(f)} className={`px-4 py-2 rounded-lg text-xs font-bold ${filterUrgency === f ? 'bg-red-600 text-white' : 'text-slate-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase border-b border-slate-700">
              <th className="py-4 px-6">Urgency</th>
              <th className="py-4 px-6">Risk Score</th>
              <th className="py-4 px-6">Policyholder</th>
              <th className="py-4 px-6">Detected Hazard</th>
              <th className="py-4 px-6">Claim Status</th>
              <th className="py-4 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-800/50">
                <td className="py-4 px-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${c.urgency === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {c.urgency}
                  </span>
                </td>
                <td className="py-4 px-6 font-bold text-white">{c.riskScore}/100</td>
                <td className="py-4 px-6 font-bold text-white">{c.name}</td>
                <td className="py-4 px-6 text-red-400 text-xs">{c.detectedHazard}</td>
                <td className="py-4 px-6">
                  {c.claimDraft?.status === 'drafted' ? <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">Draft</span> : <span className="text-xs text-slate-500">None</span>}
                </td>
                <td className="py-4 px-6 text-right">
                  <button onClick={() => setSelectedCustomerId(c.id)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1">
                    Explainability <ChevronRight className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-xl h-full p-8 overflow-y-auto flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selected.name}</h2>
                  <p className="text-xs text-slate-400">Policy #{selected.policy.policyNumber}</p>
                </div>
                <button onClick={() => setSelectedCustomerId(null)} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="bg-slate-950 p-6 rounded-2xl mb-6 border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-red-500" /> Risk Explainability</h3>
                <ul className="space-y-2 text-xs text-slate-300">
                  {selected.explainability.bulletPoints.map((pt, i) => <li key={i}>• {pt}</li>)}
                </ul>
              </div>
            </div>

            {selected.claimDraft?.status === 'drafted' && (
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-6">
                <h4 className="font-bold text-amber-300 text-sm mb-2"><FileText className="w-4 h-4 inline mr-2" /> Pre-Filed Claim Draft (${(selected.claimDraft?.estimatedLoss || selected.claimDraft?.estPayout || 0).toLocaleString()})</h4>
                <button onClick={() => approveClaimDraft(selected.id)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> 1-Click Approve Claim & Dispatch
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
