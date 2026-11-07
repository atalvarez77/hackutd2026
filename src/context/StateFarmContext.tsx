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
  sendChatMessage: (text: string, sender?: 'customer' | 'bot' | 'agent') => void;
  approveClaimDraft: (customerId: string) => void;
  updateCustomerLanguage: (customerId: string, lang: 'en' | 'es') => void;
  simulateHazardDetection: (customerId: string, hazardDescription: string, estimatedLoss: number) => void;
  resetToDefaults: () => void;
}

const StateFarmContext = createContext<StateFarmContextType | undefined>(undefined);

export const StateFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customers, setCustomers] = useState<CustomerProfile[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sf_v8');
      if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    }
    return initialCustomers;
  });

  const [activeCustomerId, setActiveCustomerId] = useState<string>(customers[0]?.id || 'cust-1');

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('sf_v8', JSON.stringify(customers));
  }, [customers]);

  const activeCustomer = customers.find((c) => c.id === activeCustomerId) || customers[0];

  const sendChatMessage = (text: string, sender: 'customer' | 'bot' | 'agent' = 'customer') => {
    setCustomers((prev) =>
      prev.map((cust) => {
        if (cust.id !== activeCustomerId) return cust;
        const newMsg = {
          id: 'msg-' + Date.now(),
          sender,
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const updatedTranscript = [...cust.chatTranscript, newMsg];
        let updatedHazard = cust.detectedHazard;
        let updatedRisk = cust.riskScore;
        let updatedUrgency = cust.urgency;
        let updatedDraft = { ...cust.claimDraft };

        if (text.toLowerCase().match(/freeze|pipe|cold|agua|helada|frio|fregadero|banging/i) && sender === 'customer') {
          updatedHazard = 'Freezing Pipes Hazard';
          updatedRisk = Math.min(98, cust.riskScore + 10);
          updatedUrgency = 'High';
          updatedDraft = {
            id: 'DRF-99',
            hazardType: 'Winter Freeze Plumbing Emergency',
            estimatedLoss: 3500,
            description: `Automated detection: "${text}"`,
            timestamp: new Date().toLocaleString(),
            status: 'drafted',
          };
          updatedTranscript.push({
            id: 'msg-w-' + Date.now(),
            sender: 'bot',
            text: cust.language === 'es' ? '⚠️ Reclamo por $3,500 creado para plomero.' : '⚠️ Pre-filed claim draft for $3,500 created.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        }

        return {
          ...cust,
          chatTranscript: updatedTranscript,
          detectedHazard: updatedHazard,
          riskScore: updatedRisk,
          urgency: updatedUrgency,
          claimDraft: updatedDraft,
          checkInStatus: 'urgent_attention',
        };
      })
    );
  };

  const approveClaimDraft = (customerId: string) => {
    setCustomers((prev) =>
      prev.map((cust) => {
        if (cust.id !== customerId) return cust;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return {
          ...cust,
          claimDraft: {
            ...cust.claimDraft,
            status: 'approved',
            approvedAt: new Date().toLocaleString(),
            claimNumber: 'SF-CLM-2026-' + Math.floor(Math.random() * 9000 + 1000),
            adjusterNotes: 'Approved via 1-click FastTrack workflow.',
          },
          checkInStatus: 'completed',
        };
      })
    );
  };

  const updateCustomerLanguage = (customerId: string, lang: 'en' | 'es') => {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, language: lang } : c)));
  };

  const simulateHazardDetection = (customerId: string, hazardDescription: string, estimatedLoss: number) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        return {
          ...c,
          detectedHazard: hazardDescription,
          riskScore: 95,
          urgency: 'High',
          checkInStatus: 'urgent_attention',
          claimDraft: {
            id: 'DRF-SIM',
            hazardType: hazardDescription,
            estimatedLoss,
            description: `Simulation: ${hazardDescription}`,
            timestamp: new Date().toLocaleString(),
            status: 'drafted',
          },
        };
      })
    );
  };

  const resetToDefaults = () => {
    setCustomers(initialCustomers);
    setActiveCustomerId(initialCustomers[0].id);
    if (typeof window !== 'undefined') localStorage.removeItem('sf_v8');
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
