import type { Language } from '@/types/statefarm';

/**
 * Spanish for the data values that come from mock data / SpacetimeDB (hazards, alerts,
 * policy types, claim types, relationships…). UI copy is translated inline with T(en, es);
 * this covers the strings that live in data, so the policyholder side is fully bilingual.
 * The agent console stays in English and shows translations under Spanish lines instead.
 */
const ES: Record<string, string> = {
  // Detected hazards
  'Freezing Pipes / Banging Below Sink': 'Tuberías congeladas / golpes bajo el fregadero',
  'Freezing Pipes Hazard': 'Riesgo de tuberías congeladas',
  'Basement Water Backup': 'Agua acumulándose en el sótano',
  'Large Oak Branch Against Roof': 'Rama grande de roble sobre el techo',
  'Branch cracked · over bedroom': 'Rama rajada · sobre la recámara',
  'Minor Roof Shingle Loss / Hail Dents': 'Pérdida de tejas / abolladuras por granizo',
  'AC Unit Failure / Indoor Temp 94°F': 'Falla del aire acondicionado / 94 °F adentro',
  'Reported storm damage': 'Daño por tormenta reportado',
  None: 'Ninguno',

  // Weather alerts
  'Winter Freeze Advisory': 'Aviso de helada invernal',
  'Flash Flood Watch': 'Vigilancia de inundación repentina',
  'High Wind Advisory': 'Aviso de vientos fuertes',
  'Severe Hailstorm Warning': 'Advertencia de granizo severo',
  'Normal Weather Conditions': 'Clima normal',
  'Extreme Heat Advisory': 'Aviso de calor extremo',
  'Temperatures dropping to 14°F. Hard freeze warning in effect.': 'Temperaturas de hasta 14 °F. Alerta de helada fuerte.',
  'Heavy torrential downpour accumulating standing water.': 'Lluvia torrencial con agua acumulada.',
  'Sustained winds 45 mph with gusts up to 65 mph.': 'Vientos de 45 mph con ráfagas de hasta 65 mph.',
  'Golfball-sized hail reported in surrounding neighborhoods.': 'Granizo del tamaño de pelotas de golf en la zona.',
  'Clear skies, 72°F. No active weather alerts.': 'Cielo despejado, 72 °F. Sin alertas.',
  'Heat index reaching 108°F.': 'Índice de calor de hasta 108 °F.',

  // Policy types
  'Homeowners Comprehensive (HO-3)': 'Seguro de vivienda integral (HO-3)',
  'Homeowners Comprehensive': 'Seguro de vivienda integral',
  'Homeowners Elite (HO-5)': 'Seguro de vivienda Elite (HO-5)',
  'Renters Comprehensive': 'Seguro integral para inquilinos',
  'Auto & Renters Bundle': 'Paquete de auto e inquilino',
  'Homeowners Senior Care': 'Seguro de vivienda para adultos mayores',

  // Claim types
  'Winter Freeze Plumbing Emergency': 'Emergencia de plomería por helada',
  'Basement Water Backup & Seepage': 'Agua y filtración en el sótano',
  'Tree Branch Impact Hazard': 'Riesgo de impacto de rama',
  'Hail Impact & Roof Inspection': 'Daño por granizo e inspección del techo',
  'Emergency HVAC Repair & Heat Mitigation': 'Reparación urgente del aire acondicionado',
  'Water damage: frozen pipe': 'Daño por agua: tubería congelada',
  'Storm damage': 'Daño por tormenta',
  'Roof Storm Damage': 'Daño al techo por tormenta',
  'Windstorm Shingles': 'Tejas dañadas por viento',
  'Auto Minor Fender': 'Golpe menor en la defensa',
  'Water Heater Leak': 'Fuga del calentador de agua',

  // Relationships
  Daughter: 'Hija',
  Father: 'Padre',
  Son: 'Hijo',
  Sister: 'Hermana',
  Spouse: 'Cónyuge',
  'Niece / Caretaker': 'Sobrina / cuidadora',

  // Coverage + confirmation sources
  Covered: 'Cubierto',
  'Not covered': 'No cubierto',
  'Confirmed on call': 'Confirmado en la llamada',
  'Corrected on call': 'Corregido en la llamada',
  portal: 'portal',
};

/** Translate a data value for the policyholder's language (falls back to the original). */
export const tx = (s: string | undefined | null, lang: Language): string => (s ? (lang === 'es' ? (ES[s] ?? s) : s) : '');

/** Shared T(en, es) helper factory. */
export const makeT = (lang: Language) => (en: string, es: string) => (lang === 'es' ? es : en);

/** The demo loss date, localized. */
export const lossDate = (lang: Language) => (lang === 'es' ? '7 nov 2026 · ~6:00 AM' : 'Nov 7, 2026 · ~6:00 AM');
