export interface Region {
  code: string;
  name: string;
  country: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
}

export const MENA_REGIONS: Region[] = [
  // UAE (AED)
  { code: 'dubai', name: 'Dubai', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'abu-dhabi', name: 'Abu Dhabi', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'sharjah', name: 'Sharjah', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'ajman', name: 'Ajman', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  // Saudi Arabia (SAR)
  { code: 'riyadh', name: 'Riyadh', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'jeddah', name: 'Jeddah', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'dammam', name: 'Dammam', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  // Bahrain (BHD)
  { code: 'manama', name: 'Manama', country: 'BH', currency: 'BHD', currencySymbol: '.\u062F.\u0628', timezone: 'Asia/Bahrain' },
  // Oman (OMR)
  { code: 'muscat', name: 'Muscat', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  // Qatar (QAR)
  { code: 'doha', name: 'Doha', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  // Kuwait (KWD)
  { code: 'kuwait', name: 'Kuwait City', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  // Egypt (EGP)
  { code: 'cairo', name: 'Cairo', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  // Jordan (JOD)
  { code: 'amman', name: 'Amman', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  // Lebanon (LBP)
  { code: 'beirut', name: 'Beirut', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
];

export function getRegionByCode(code: string): Region | undefined {
  return MENA_REGIONS.find(r => r.code === code);
}

export function resolveRegions(codes: string[]): Region[] {
  return codes.map(c => MENA_REGIONS.find(r => r.code === c)).filter(Boolean) as Region[];
}
