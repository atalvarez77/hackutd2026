export type Language = 'en' | 'es';

export interface DynamicCustomer {
  id: string;
  name: string;
  age: number;
  livesAlone: boolean;
  language: Language;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  avatarUrl: string;
  policy: {
    policyNumber: string;
    type: string;
    coverageLimit: number;
    deductible: number;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  priorityScore: number;
  priorityReasons: string[];
  recommendedAction: string;
  status: string;
  autoFiledClaim: {
    active: boolean;
    type: string;
    damageSummary: string;
    estimatedInitialPayout: number;
    coveredUnderPolicy: boolean;
    claimNumber?: string;
    status: 'Drafted' | 'Approved' | 'Rejected';
  };
  chatTranscript: Array<{
    id: string;
    sender: 'customer' | 'bot' | 'agent';
    text: string;
    timestamp: string;
  }>;
}

export interface SpacetimeCustomer extends DynamicCustomer {}
export interface SpacetimePolicy {
  id: string;
  customerId: string;
  policyNumber: string;
  type: string;
  coverageLimit: number;
  deductible: number;
  effectiveDate: string;
}
export interface SpacetimeClaim {
  id: string;
  customerId: string;
  whenMade: string;
  description: string;
  estPayout: number;
  status: 'Drafted' | 'Approved' | 'Settled';
  filingMethod: 'AI Voice Call' | 'Customer Portal Chat' | 'Agent Override';
}
export interface SpacetimeInteractionLog {
  id: string;
  customerId: string;
  sender: 'customer' | 'bot' | 'agent';
  modeChannel: 'Voice (Web Speech API)' | 'Chat Portal' | 'Agent Step-In';
  transcript: string;
  timestamp: string;
  verbalConsentFlag: boolean;
}
export interface TriageQueueItem {
  customerId: string;
  customerName: string;
  priorityScore: number;
  category: string;
  summary: string;
  urgency: 'High' | 'Medium' | 'Low';
}

