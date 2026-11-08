'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { CustomerProfile } from '@/types/statefarm';
import { initialCustomers } from '@/data/mockCustomers';
import confetti from 'canvas-confetti';

interface StateFarmContextType {
  customers: CustomerProfile[];
  activeCustomerId: string;
  setActiveCustomerId: (id: string) => void;
  activeCustomer: CustomerProfile;
  sendChatMessage: (text: string, sender?: 'customer' | 'bot' | 'agent') => Promise<void>;
  approveClaimDraft: (customerId: string) => void;
  updateCustomerLanguage: (customerId: string, lang: 'en' | 'es') => void;
  simulateHazardDetection: (customerId: string, hazardDescription: string, estimatedLoss: number) => void;
  resetToDefaults: () => void;
}

const StateFarmContext = createContext<StateFarmContextType | undefined>(undefined);

export const StateFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customers, setCustomers] = useState<CustomerProfile[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sf_nemo_v5');
      if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    }
    return initialCustomers;
  });

  const [activeCustomerId, setActiveCustomerId] = useState<string>(customers[0]?.id || 'cust-1');

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('sf_nemo_v5', JSON.stringify(customers));
  }, [customers]);

  const activeCustomer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const sendChatMessage = async (text: string, sender: 'customer' | 'bot' | 'agent' = 'customer') => {
    setCustomers((prev) =>
      prev.map((cust) => {
        if (cust.id !== activeCustomerId) return cust;
        return {
          ...cust,
          chatTranscript: [
            ...cust.chatTranscript,
            { id: 'msg-' + Date.now(), sender, text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
          ],
        };
      })
    );

    if (sender === 'customer') {
      try {
        const response = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerProfile: activeCustomer, message: text, transcript: activeCustomer.chatTranscript }),
        });
        const r = await response.json();
        console.log("API Response:", r);

        if (!response.ok || r.error) {
          const errorMessage = "API Error: " + (r.error || r.details || response.statusText);
          setCustomers((prev) =>
            prev.map((cust) => {
              if (cust.id !== activeCustomerId) return cust;
              return {
                ...cust,
                chatTranscript: [
                  ...cust.chatTranscript,
                  { id: 'bot-' + Date.now(), sender: 'bot', text: errorMessage, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                ],
              };
            })
          );
          return;
        }

        const botReply = r.reply || r.customer_response || r.message;
        setCustomers((prev) =>
          prev.map((cust) => {
            if (cust.id !== activeCustomerId) return cust;
            const score = r.triage?.risk_score ?? 15;
            return {
              ...cust,
              riskScore: score,
              urgency: score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low',
              detectedHazard: r.triage?.claim_summary?.damage_description || text,
              explainability: {
                ...cust.explainability,
                bulletPoints: r.triage?.top_reasons || [text],
                recommendedActions: [r.triage?.agent_action || 'Review report.'],
              },
              claimDraft: r.triage?.file_claim ? {
                id: 'DRF-' + Math.floor(Math.random() * 900 + 100),
                hazardType: r.triage?.claim_summary?.loss_type || 'Emergency Repair',
                estimatedLoss: r.triage?.claim_summary?.estimated_initial_payout || 3000,
                description: r.triage?.claim_summary?.damage_description || text,
                timestamp: new Date().toLocaleString(),
                status: 'drafted',
              } : cust.claimDraft,
              chatTranscript: [
                ...cust.chatTranscript,
                { id: 'bot-' + Date.now(), sender: 'bot', text: botReply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
              ],
            };
          })
        );
      } catch (e: any) {
        console.error(e);
      }
    }
  };

  const approveClaimDraft = (customerId: string) => {
    setCustomers((prev) =>
      prev.map((cust) => {
        if (cust.id !== customerId) return cust;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return {
          ...cust,
          claimDraft: { ...cust.claimDraft, status: 'approved', approvedAt: new Date().toLocaleString(), claimNumber: 'SF-CLM-' + Math.floor(Math.random() * 9000 + 1000) },
        };
      })
    );
  };

  const updateCustomerLanguage = (customerId: string, lang: 'en' | 'es') => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        const greetingText = lang === 'es'
          ? `¡Hola ${c.name}! Soy su asistente de State Farm Good Neighbor, aquí para ayudarle con cualquier emergencia durante la tormenta. ¿Cómo se encuentra y cómo está su hogar?`
          : `Hello ${c.name}, this is State Farm reaching out for a routine check-in during the severe weather event. How are you and your home holding up right now?`;

        const newTranscript = c.chatTranscript.length > 0
          ? [{ ...c.chatTranscript[0], text: greetingText, sender: 'bot' as const }, ...c.chatTranscript.slice(1)]
          : [{ id: 'greet-' + Date.now(), sender: 'bot' as const, text: greetingText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];

        return {
          ...c,
          language: lang,
          chatTranscript: newTranscript,
        };
      })
    );
  };

  const simulateHazardDetection = (customerId: string, hazardDescription: string, estimatedLoss: number) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, detectedHazard: hazardDescription, riskScore: 90, urgency: 'High', claimDraft: { id: 'SIM', hazardType: hazardDescription, estimatedLoss, description: hazardDescription, timestamp: new Date().toLocaleString(), status: 'drafted' } } : c))
    );
  };

  const resetToDefaults = () => {
    setCustomers(initialCustomers);
    setActiveCustomerId(initialCustomers[0].id);
    if (typeof window !== 'undefined') localStorage.removeItem('sf_nemo_v5');
  };

  return (
    <StateFarmContext.Provider value={{ customers, activeCustomerId, setActiveCustomerId, activeCustomer, sendChatMessage, approveClaimDraft, updateCustomerLanguage, simulateHazardDetection, resetToDefaults }}>
      {children}
    </StateFarmContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StateFarmContext);
  if (!context) throw new Error('useStore must be used within StateFarmProvider');
  return context;
};
