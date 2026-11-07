export type Language = 'en' | 'es';

export type UrgencyLevel = 'High' | 'Medium' | 'Low';

export type ClaimDraftStatus = 'none' | 'drafted' | 'approved' | 'rejected';

export interface ClaimRecord {
  id: string;
  date: string;
  type: string;
  amount: number;
  status: 'Settled' | 'Pending' | 'Approved' | 'Closed';
  description: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface PolicyDetails {
  policyNumber: string;
  type: string;
  coverageLimit: number;
  deductible: number;
  effectiveDate: string;
  monthlyPremium: number;
}

export interface RiskExplainability {
  environmentalFactorScore: number;
  vulnerabilityFactorScore: number;
  propertyFactorScore: number;
  historyFactorScore: number;
  bulletPoints: string[];
  recommendedActions: string[];
}

export interface ClaimDraft {
  id: string;
  hazardType: string;
  estimatedLoss: number;
  description: string;
  timestamp: string;
  status: ClaimDraftStatus;
  approvedAt?: string;
  claimNumber?: string;
  adjusterNotes?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'agent';
  text: string;
  timestamp: string;
  isHazardAlert?: boolean;
}

export interface CustomerProfile {
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
  weatherAlert: {
    active: boolean;
    title: string;
    description: string;
    severity: UrgencyLevel;
  };
  riskScore: number; // 0 - 100
  urgency: UrgencyLevel;
  detectedHazard: string; // e.g. "Freezing Pipes", "Basement Flooding", "None"
  checkInStatus: 'pending' | 'in_progress' | 'completed' | 'urgent_attention';
  policy: PolicyDetails;
  emergencyContact: EmergencyContact;
  claimsHistory: ClaimRecord[];
  explainability: RiskExplainability;
  claimDraft: ClaimDraft;
  chatTranscript: ChatMessage[];
}
