export interface Region {
  code: string;
  name: string;
  country: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
}

export const REGIONS: Region[] = [
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
  // Pakistan (PKR)
  { code: 'punjab', name: 'Punjab', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'sindh', name: 'Sindh', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'kpk', name: 'KPK', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'balochistan', name: 'Balochistan', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'islamabad', name: 'Islamabad', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  // India (INR)
  { code: 'maharashtra', name: 'Maharashtra', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'delhi', name: 'Delhi', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'karnataka', name: 'Karnataka', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'telangana', name: 'Telangana', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'tamil-nadu', name: 'Tamil Nadu', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'gujarat', name: 'Gujarat', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'rajasthan', name: 'Rajasthan', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
];

/** @deprecated Use REGIONS instead */
export const MENA_REGIONS = REGIONS;

export function getRegionByCode(code: string): Region | undefined {
  return REGIONS.find(r => r.code === code);
}

export function resolveRegions(codes: string[]): Region[] {
  return codes.map(c => REGIONS.find(r => r.code === c)).filter(Boolean) as Region[];
}
