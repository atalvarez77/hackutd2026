import type { ClaimFlow, CustomerProfile, Language } from '@/types/statefarm';
import { coverageVerdict, isWaterHazard, lastCustomerQuote, money, WATER_BACKUP } from './hn';

export type SourceKind = 'call' | 'policy' | 'transcript';

export interface FieldDef {
  key: string;
  label: string;
  value: string;
  src: string;
  kind: SourceKind;
}

/** The two pre-filled claim steps. Nora only uses data State Farm already has. */
export function claimFields(c: CustomerProfile, claim: ClaimFlow, lang: Language): FieldDef[][] {
  const es = lang === 'es';
  const water = isWaterHazard(claim.type + ' ' + c.detectedHazard);
  return [
    [
      { key: 'type', label: es ? 'Qué pasó' : 'What happened', value: c.detectedHazard, src: es ? 'su llamada con Nora' : 'your call with Nora', kind: 'call' },
      { key: 'when', label: es ? 'Cuándo' : 'When', value: 'Nov 7, 2026 · ~6:00 AM', src: es ? 'lo que dijo + línea de helada NWS' : 'what you told Nora + NWS freeze timeline', kind: 'call' },
      { key: 'where', label: es ? 'Dónde' : 'Where', value: `${c.address}, ${c.city} ${c.state} ${c.zip}`, src: es ? 'dirección de su póliza' : 'your policy address on file', kind: 'policy' },
      { key: 'quote', label: es ? 'En sus palabras' : 'In your words', value: lastCustomerQuote(c), src: es ? 'transcripción de Nora' : 'Nora transcript', kind: 'transcript' },
    ],
    [
      { key: 'safe', label: es ? '¿Todos están bien?' : 'Is everyone safe?', value: es ? 'Sí, nadie está herido' : 'Yes, no one is hurt', src: es ? 'su llamada con Nora' : 'your call with Nora', kind: 'call' },
      water
        ? { key: 'shut', label: es ? '¿Cerró la llave principal?' : 'Water shut off at the main?', value: es ? 'Nora le mandó los pasos' : 'Nora sent the steps', src: es ? 'su llamada con Nora' : 'your call with Nora', kind: 'call' }
        : { key: 'shut', label: es ? '¿El área está segura?' : 'Is the area secured?', value: es ? 'Lejos de la zona dañada' : 'Staying away from the damaged area', src: es ? 'su llamada con Nora' : 'your call with Nora', kind: 'call' },
      { key: 'heat', label: es ? 'Calefacción' : 'Heat source', value: es ? 'Calentador a 1 m de distancia' : 'Space heater · 3 ft clearance advised', src: es ? 'su llamada con Nora' : 'your call with Nora', kind: 'transcript' },
      { key: 'notify', label: es ? 'A quién avisamos' : 'Who we told', value: `${c.emergencyContact.name} (${c.emergencyContact.relationship}) · ${c.emergencyContact.phone}`, src: es ? 'contactos de emergencia' : 'emergency contacts on file', kind: 'policy' },
    ],
  ];
}

export const STEP_KEYS = [
  ['type', 'when', 'where', 'quote'],
  ['safe', 'shut', 'heat', 'notify'],
];

export function coverageCards(c: CustomerProfile) {
  return [
    { k: 'POLICY', v: c.policy.policyNumber, src: c.policy.type },
    { k: 'DWELLING', v: money(c.policy.coverageLimit), src: 'Coverage A' },
    { k: 'DEDUCTIBLE', v: money(c.policy.deductible), src: 'Declarations page' },
    { k: 'WATER BACKUP', v: WATER_BACKUP[c.id], src: 'Endorsement' },
  ];
}

export function verdictCopy(c: CustomerProfile, claim: ClaimFlow, lang: Language) {
  const { covered } = coverageVerdict(c, claim.type + ' ' + c.detectedHazard);
  const es = lang === 'es';
  const tail = es ? ' Nora no toma la decisión final; su ajustador la confirma.' : ' Nora doesn’t make the final call; your adjuster confirms it.';
  return covered
    ? {
        covered,
        title: es ? 'Esto parece estar cubierto.' : 'This looks covered.',
        body: (es ? `Su ${c.policy.type} parece cubrir esto. Deducible: ${money(c.policy.deductible)}.` : `Sudden, accidental damage like this looks covered under your ${c.policy.type}. Your deductible is ${money(c.policy.deductible)}.`) + tail,
      }
    : {
        covered,
        title: es ? 'Puede que esto no esté cubierto.' : 'This may not be covered.',
        body: (es ? 'Su póliza no tiene endoso de respaldo de agua. Un agente lo revisará con usted.' : 'Your policy has no water backup endorsement. An agent will review it with you.') + tail,
      };
}

export const CLAIM_STEPS: { en: string; es: string; whoEn: string; whoEs: string }[] = [
  { en: 'Report the loss', es: 'Reportar el daño', whoEn: 'Nora pre-filled', whoEs: 'Pre-llenado por Nora' },
  { en: 'Safety check', es: 'Seguridad', whoEn: 'You confirm', whoEs: 'Usted confirma' },
  { en: 'Photos', es: 'Fotos', whoEn: 'You add', whoEs: 'Usted agrega' },
  { en: 'Coverage check', es: 'Cobertura', whoEn: 'Nora reads your policy', whoEs: 'Nora lee su póliza' },
  { en: 'Review & submit', es: 'Revisar y enviar', whoEn: 'Claim # issued', whoEs: 'Se emite el número' },
  { en: 'Adjuster assigned', es: 'Ajustador asignado', whoEn: 'State Farm · within 24h', whoEs: 'State Farm · en 24h' },
  { en: 'Estimate', es: 'Estimado', whoEn: 'Inspection', whoEs: 'Inspección' },
  { en: 'Payment', es: 'Pago', whoEn: 'Minus deductible', whoEs: 'Menos deducible' },
];
