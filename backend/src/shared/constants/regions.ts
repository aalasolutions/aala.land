export interface Region {
  code: string;
  name: string;
  country: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
}

export const COUNTRY_NAMES: Record<string, string> = {
  // MENA (alphabetical)
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  BH: 'Bahrain',
  EG: 'Egypt',
  JO: 'Jordan',
  KW: 'Kuwait',
  LB: 'Lebanon',
  OM: 'Oman',
  QA: 'Qatar',
  // Asia (alphabetical)
  IN: 'India',
  PK: 'Pakistan',
};

export const REGIONS: Region[] = [
  // United Arab Emirates (AED) — 7 emirates
  { code: 'dubai', name: 'Dubai', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'abu-dhabi', name: 'Abu Dhabi', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'sharjah', name: 'Sharjah', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'ajman', name: 'Ajman', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'ras-al-khaimah', name: 'Ras Al Khaimah', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'fujairah', name: 'Fujairah', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },
  { code: 'umm-al-quwain', name: 'Umm Al Quwain', country: 'AE', currency: 'AED', currencySymbol: '\u062F.\u0625', timezone: 'Asia/Dubai' },

  // Saudi Arabia (SAR) — 13 administrative regions
  { code: 'riyadh', name: 'Riyadh', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'makkah', name: 'Makkah', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'madinah', name: 'Madinah', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'eastern-province', name: 'Eastern Province', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'asir', name: 'Asir', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'tabuk', name: 'Tabuk', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'hail', name: "Ha'il", country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'northern-borders', name: 'Northern Borders', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'jazan', name: 'Jazan', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'najran', name: 'Najran', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'al-baha', name: 'Al Baha', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'al-jawf', name: 'Al Jawf', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },
  { code: 'qassim', name: 'Qassim', country: 'SA', currency: 'SAR', currencySymbol: '\u0631.\u0633', timezone: 'Asia/Riyadh' },

  // Bahrain (BHD) — 4 governorates
  { code: 'capital-bh', name: 'Capital', country: 'BH', currency: 'BHD', currencySymbol: '.\u062F.\u0628', timezone: 'Asia/Bahrain' },
  { code: 'muharraq', name: 'Muharraq', country: 'BH', currency: 'BHD', currencySymbol: '.\u062F.\u0628', timezone: 'Asia/Bahrain' },
  { code: 'northern-bh', name: 'Northern', country: 'BH', currency: 'BHD', currencySymbol: '.\u062F.\u0628', timezone: 'Asia/Bahrain' },
  { code: 'southern-bh', name: 'Southern', country: 'BH', currency: 'BHD', currencySymbol: '.\u062F.\u0628', timezone: 'Asia/Bahrain' },

  // Oman (OMR) — 11 governorates
  { code: 'muscat', name: 'Muscat', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'dhofar', name: 'Dhofar', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-batinah-north', name: 'Al Batinah North', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-batinah-south', name: 'Al Batinah South', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-dakhliyah', name: 'Al Dakhliyah', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-sharqiyah-north', name: 'Al Sharqiyah North', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-sharqiyah-south', name: 'Al Sharqiyah South', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-dhahirah', name: 'Al Dhahirah', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-buraimi', name: 'Al Buraimi', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'al-wusta', name: 'Al Wusta', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },
  { code: 'musandam', name: 'Musandam', country: 'OM', currency: 'OMR', currencySymbol: '\u0631.\u0639.', timezone: 'Asia/Muscat' },

  // Qatar (QAR) — 8 municipalities
  { code: 'doha', name: 'Doha', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-rayyan', name: 'Al Rayyan', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-wakrah', name: 'Al Wakrah', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-khor', name: 'Al Khor', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'umm-salal', name: 'Umm Salal', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-daayen', name: 'Al Daayen', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-shamal', name: 'Al Shamal', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },
  { code: 'al-shahaniya', name: 'Al Shahaniya', country: 'QA', currency: 'QAR', currencySymbol: '\u0631.\u0642', timezone: 'Asia/Qatar' },

  // Kuwait (KWD) — 6 governorates
  { code: 'capital-kw', name: 'Capital', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  { code: 'hawalli', name: 'Hawalli', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  { code: 'farwaniya', name: 'Farwaniya', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  { code: 'ahmadi', name: 'Ahmadi', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  { code: 'jahra', name: 'Jahra', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },
  { code: 'mubarak-al-kabeer', name: 'Mubarak Al Kabeer', country: 'KW', currency: 'KWD', currencySymbol: '\u062F.\u0643', timezone: 'Asia/Kuwait' },

  // Egypt (EGP) — 27 governorates
  { code: 'cairo', name: 'Cairo', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'giza', name: 'Giza', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'alexandria', name: 'Alexandria', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'qalyubia', name: 'Qalyubia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'dakahlia', name: 'Dakahlia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'sharqia', name: 'Sharqia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'gharbia', name: 'Gharbia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'monufia', name: 'Monufia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'beheira', name: 'Beheira', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'kafr-el-sheikh', name: 'Kafr El Sheikh', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'damietta', name: 'Damietta', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'port-said', name: 'Port Said', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'ismailia', name: 'Ismailia', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'suez', name: 'Suez', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'north-sinai', name: 'North Sinai', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'south-sinai', name: 'South Sinai', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'red-sea', name: 'Red Sea', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'new-valley', name: 'New Valley', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'matrouh', name: 'Matrouh', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'faiyum', name: 'Faiyum', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'beni-suef', name: 'Beni Suef', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'minya', name: 'Minya', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'asyut', name: 'Asyut', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'sohag', name: 'Sohag', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'qena', name: 'Qena', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'luxor', name: 'Luxor', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },
  { code: 'aswan', name: 'Aswan', country: 'EG', currency: 'EGP', currencySymbol: '\u062C.\u0645', timezone: 'Africa/Cairo' },

  // Jordan (JOD) — 12 governorates
  { code: 'amman', name: 'Amman', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'irbid', name: 'Irbid', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'zarqa', name: 'Zarqa', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'balqa', name: 'Balqa', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'madaba', name: 'Madaba', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'karak', name: 'Karak', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'tafilah', name: 'Tafilah', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'maan', name: "Ma'an", country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'aqaba', name: 'Aqaba', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'mafraq', name: 'Mafraq', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'jerash', name: 'Jerash', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },
  { code: 'ajloun', name: 'Ajloun', country: 'JO', currency: 'JOD', currencySymbol: '\u062F.\u0627', timezone: 'Asia/Amman' },

  // Lebanon (LBP) — 8 governorates
  { code: 'beirut', name: 'Beirut', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'mount-lebanon', name: 'Mount Lebanon', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'north-lebanon', name: 'North Lebanon', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'south-lebanon', name: 'South Lebanon', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'bekaa', name: 'Bekaa', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'nabatieh', name: 'Nabatieh', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'akkar', name: 'Akkar', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },
  { code: 'baalbek-hermel', name: 'Baalbek-Hermel', country: 'LB', currency: 'LBP', currencySymbol: '\u0644.\u0644', timezone: 'Asia/Beirut' },

  // Pakistan (PKR) — 6 administrative units
  { code: 'punjab', name: 'Punjab', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'sindh', name: 'Sindh', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'kpk', name: 'Khyber Pakhtunkhwa', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'balochistan', name: 'Balochistan', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'islamabad', name: 'Islamabad Capital', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },
  { code: 'gilgit-baltistan', name: 'Gilgit-Baltistan', country: 'PK', currency: 'PKR', currencySymbol: '\u20A8', timezone: 'Asia/Karachi' },

  // India (INR) — 28 states + 8 union territories (major ones)
  { code: 'andhra-pradesh', name: 'Andhra Pradesh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'arunachal-pradesh', name: 'Arunachal Pradesh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'assam', name: 'Assam', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'bihar', name: 'Bihar', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'chhattisgarh', name: 'Chhattisgarh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'goa', name: 'Goa', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'gujarat', name: 'Gujarat', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'haryana', name: 'Haryana', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'himachal-pradesh', name: 'Himachal Pradesh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'jharkhand', name: 'Jharkhand', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'karnataka', name: 'Karnataka', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'kerala', name: 'Kerala', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'madhya-pradesh', name: 'Madhya Pradesh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'maharashtra', name: 'Maharashtra', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'manipur', name: 'Manipur', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'meghalaya', name: 'Meghalaya', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'mizoram', name: 'Mizoram', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'nagaland', name: 'Nagaland', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'odisha', name: 'Odisha', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'punjab-in', name: 'Punjab', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'rajasthan', name: 'Rajasthan', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'sikkim', name: 'Sikkim', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'tamil-nadu', name: 'Tamil Nadu', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'telangana', name: 'Telangana', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'tripura', name: 'Tripura', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'uttar-pradesh', name: 'Uttar Pradesh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'uttarakhand', name: 'Uttarakhand', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'west-bengal', name: 'West Bengal', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'delhi', name: 'Delhi', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'jammu-kashmir', name: 'Jammu & Kashmir', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'ladakh', name: 'Ladakh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'chandigarh', name: 'Chandigarh', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
  { code: 'puducherry', name: 'Puducherry', country: 'IN', currency: 'INR', currencySymbol: '\u20B9', timezone: 'Asia/Kolkata' },
];

/** @deprecated Use REGIONS instead */
export const MENA_REGIONS = REGIONS;

export function getRegionByCode(code: string): Region | undefined {
  return REGIONS.find(r => r.code === code);
}

export function resolveRegions(codes: string[]): Region[] {
  return codes.map(c => REGIONS.find(r => r.code === c)).filter(Boolean) as Region[];
}

export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export function getRegionsGroupedByCountry(): { country: string; countryName: string; regions: Region[] }[] {
  const grouped: Record<string, Region[]> = {};
  for (const r of REGIONS) {
    if (!grouped[r.country]) grouped[r.country] = [];
    grouped[r.country].push(r);
  }
  const countryOrder = Object.keys(COUNTRY_NAMES);
  return countryOrder
    .filter(c => grouped[c])
    .map(c => ({ country: c, countryName: COUNTRY_NAMES[c], regions: grouped[c] }));
}
