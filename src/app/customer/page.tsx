'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { Bot, User, Phone, PhoneOff, Globe, Send, ShieldAlert } from 'lucide-react';

export default function CustomerPortalPage() {
  const { activeCustomer, sendChatMessage, updateCustomerLanguage } = useStore();
  const [inputText, setInputText] = useState('');
  const [callActive, setCallActive] = useState(false);
  const isSpanish = activeCustomer.language === 'es';

  return (
    <div className="flex flex-col flex-1 bg-slate-950 text-slate-100 max-w-7xl mx-auto w-full px-4 py-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-4">
          <img src={activeCustomer.avatarUrl} alt={activeCustomer.name} className="w-16 h-16 rounded-full object-cover border-2 border-red-500 shadow" />
          <div>
            <h1 className="text-2xl font-bold text-white">{activeCustomer.name}</h1>
            <p className="text-xs text-slate-400">Policy #{activeCustomer.policy.policyNumber} • Risk: {activeCustomer.riskScore}/100</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
          <Globe className="w-4 h-4 text-slate-400 ml-2" />
          <button onClick={() => updateCustomerLanguage(activeCustomer.id, 'en')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!isSpanish ? 'bg-red-600 text-white' : 'text-slate-400'}`}>EN</button>
          <button onClick={() => updateCustomerLanguage(activeCustomer.id, 'es')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isSpanish ? 'bg-red-600 text-white' : 'text-slate-400'}`}>ES</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden h-[420px]">
          <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3"><Bot className="w-5 h-5 text-red-500" /><h3 className="font-bold text-sm text-white">State Farm Good Neighbor Bot</h3></div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {activeCustomer.chatTranscript.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.sender === 'customer' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'customer' ? 'bg-red-600 text-white' : 'bg-slate-800 text-red-400'}`}>
                  {msg.sender === 'customer' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${msg.sender === 'customer' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (!inputText.trim()) return; sendChatMessage(inputText, 'customer'); setInputText(''); }} className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type message..." className="flex-1 bg-slate-950 border border-slate-800 text-sm text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500" />
            <button type="submit" className="bg-red-600 hover:bg-red-500 text-white p-3 rounded-xl"><Send className="w-5 h-5" /></button>
          </form>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden h-[420px] items-center justify-center p-8 text-center">
          {!callActive ? (
            <div>
              <div className="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mb-6 mx-auto animate-pulse">
                <Phone className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Incoming Welfare Call</h3>
              <button onClick={() => setCallActive(true)} className="mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 mx-auto">
                <Phone className="w-5 h-5" /> Accept Call
              </button>
            </div>
          ) : (
            <div>
              <div className="w-16 h-16 rounded-full bg-emerald-600/20 border border-emerald-500 flex items-center justify-center mb-4 mx-auto animate-pulse">
                <Phone className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Live Voice Call Connected</h3>
              <button onClick={() => setCallActive(false)} className="mt-6 bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 mx-auto">
                <PhoneOff className="w-5 h-5" /> End Call
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
