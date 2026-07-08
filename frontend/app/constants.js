export const AMENITY_OPTIONS = [
  { key: 'free_parking', label: 'Free Parking', icon: 'car' },
  { key: 'paid_parking', label: 'Paid Parking', icon: 'car-profile' },
  { key: 'gym', label: 'Gym', icon: 'barbell' },
  { key: 'pool', label: 'Pool', icon: 'swimming-pool' },
  { key: 'wifi', label: 'WiFi', icon: 'wifi-high' },
  { key: 'ac', label: 'AC', icon: 'fan' },
  { key: 'heating', label: 'Heating', icon: 'flame' },
  { key: 'security', label: '24/7 Security', icon: 'shield-check' },
  { key: 'concierge', label: 'Concierge', icon: 'bell-ringing' },
  { key: 'balcony', label: 'Balcony', icon: 'balcony' },
  { key: 'terrace', label: 'Terrace', icon: 'tree' },
  { key: 'garden', label: 'Garden', icon: 'plant' },
  { key: 'pet_friendly', label: 'Pet Friendly', icon: 'dog' },
  { key: 'furnished', label: 'Furnished', icon: 'couch' },
  { key: 'laundry', label: 'Laundry', icon: 'washing-machine' },
  { key: 'storage', label: 'Storage', icon: 'archive-box' },
  { key: 'children_play_area', label: 'Children Play Area', icon: 'baby' },
  { key: 'bbq_area', label: 'BBQ Area', icon: 'fire' },
  { key: 'maids_room', label: 'Maids Room', icon: 'user' },
  { key: 'study_room', label: 'Study Room', icon: 'book-open' },
];


export const PROPERTY_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'rented', label: 'Rented' },
  { value: 'sold', label: 'Sold' },
  { value: 'maintenance', label: 'Maintenance' },
];

export const PROPERTY_FILTER_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  ...PROPERTY_STATUS_OPTIONS
];

export const PROPERTY_TYPE_OPTIONS = [
  { value: '', label: 'Not Listed' },
  { value: 'RENTAL', label: 'For Rent' },
  { value: 'FOR_SALE', label: 'For Sale' },
];

export const PROPERTY_SUB_TYPES = [
  { value: 'APARTMENT', label: 'Apartment / Flat' },
  { value: 'VILLA', label: 'Villa / House' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'PENTHOUSE', label: 'Penthouse' },
  { value: 'OFFICE_SPACE', label: 'Office' },
  { value: 'RETAIL_STORE', label: 'Retail / Shop' },
  { value: 'WAREHOUSE', label: 'Warehouse / Industrial' },
  { value: 'LAND_PLOT', label: 'Plot of Land' },
];


export const FILTER_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'RENTAL', label: 'For Rent' },
  { value: 'FOR_SALE', label: 'For Sale' },
];


export const FILTER_BEDS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '0', label: 'Studio' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];



export const CHEQUE_TYPE_OPTIONS = [
  { value: 'RENT', label: 'Rent' },
  { value: 'SECURITY_DEPOSIT', label: 'Security Deposit' },
  { value: 'AGENCY_COMMISSION', label: 'Agency Commission' },
  { value: 'UTILITY_DEPOSIT', label: 'Utility / Chiller Deposit' },
  { value: 'MAINTENANCE', label: 'Maintenance / Service Charges' },
  { value: 'MANAGEMENT_FEE', label: 'Property Management Fee' },
  { value: 'REFUND', label: 'Refund / Return Cheque' },
  { value: 'OTHER', label: 'Other' },
];

export const EMPTY_UNIT_OPTION = { value: '', label: 'No property linked' };


export const FILTER_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PAID', label: 'Paid' },
];

export const COMMISSION_TYPE_OPTIONS = [
  { value: 'SALE', label: 'Sale' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'REFERRAL', label: 'Referral' },
];


export const CONTACT_TYPES = [
  { value: 'LEAD', label: 'Lead / Prospect' },
  { value: 'TENANT', label: 'Tenant (Primary)' },
  { value: 'CO_TENANT', label: 'Co-Tenant / Occupant' },
  { value: 'OWNER', label: 'Owner / Landlord' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'AGENT', label: 'Agent / Broker' },
  { value: 'VENDOR', label: 'Vendor / Contractor' },
  { value: 'GUARANTOR', label: 'Guarantor' },
  { value: 'POA_HOLDER', label: 'Power of Attorney (POA)' },
  { value: 'PROPERTY_MANAGER', label: 'Property Manager' },
  { value: 'OTHER', label: 'Other' },
];


export const CATEGORIES = [
  { value: '', label: 'All Categories' },

  // --- Agreements & Legal ---
  { value: 'LEASE', label: 'Lease / Tenancy Contract' },
  { value: 'EJARI', label: 'Ejari Certificate' },
  { value: 'SPA', label: 'Sales & Purchase Agreement (SPA)' },
  { value: 'MOU', label: 'MOU / Form F' },
  { value: 'NOC', label: 'No Objection Certificate (NOC)' },

  // --- Ownership & Government ---
  { value: 'TITLE_DEED', label: 'Title Deed' },
  { value: 'OQOOD', label: 'Oqood (Pre-Title Deed)' },
  { value: 'AFFECTION_PLAN', label: 'Site / Affection Plan' },

  // --- Identity & Compliance (KYC) ---
  { value: 'ID_PASSPORT', label: 'Passport Copy' },
  { value: 'ID_VISA', label: 'Visa & Emirates ID' },
  { value: 'CORP_DOCS', label: 'Trade License / Corporate Docs' },
  { value: 'POWER_OF_ATTORNEY', label: 'Power of Attorney (POA)' },

  // --- Financials & Utilities ---
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'UTILITY_BILL', label: 'Utility Bill (DEWA/Chiller)' },
  { value: 'CHEQUE_COPY', label: 'Cheque Copy' },
  { value: 'TAX_DOCUMENT', label: 'Tax / VAT Document' },

  // --- Property Management & Operations ---
  { value: 'INSURANCE', label: 'Insurance Policy' },
  { value: 'MAINTENANCE', label: 'Maintenance & Snagging' },
  { value: 'VALUATION', label: 'Valuation Report' },
  { value: 'PHOTOS_MEDIA', label: 'Photos & Media' },

  { value: 'OTHER', label: 'Other Documents' },
];

export const ACCESS_LEVELS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'COMPANY', label: 'Company' },
  { value: 'OWNER_ONLY', label: 'Owner Only' },
  { value: 'ADMIN_ONLY', label: 'Admin Only' },
];




export const EMAIL_CATEGORIES = [
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'WELCOME', label: 'Welcome' },
  { value: 'LEASE_RENEWAL', label: 'Lease Renewal' },
  { value: 'PAYMENT_REMINDER', label: 'Payment Reminder' },
  { value: 'MAINTENANCE_UPDATE', label: 'Maintenance Update' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const EMAIL_FILTER_CATEGORIES = [
  { value: '', label: 'All Categories' },
  ...EMAIL_CATEGORIES,
];






export const TRANSACTION_TYPE_OPTIONS = [
  // --- Standard P&L Cash Flows ---
  { value: 'INCOME', label: 'Income / Revenue' },
  { value: 'EXPENSE', label: 'Expense / Outflow' },

  // --- Balance Sheet & Liability Movements ---
  { value: 'DEPOSIT_IN', label: 'Deposit Received (Liability)' },
  { value: 'DEPOSIT_OUT', label: 'Deposit Refunded / Released' },

  // --- Internal Transfers & Equity ---
  { value: 'OWNER_DRAW', label: 'Owner Distribution / Payout' },
  { value: 'OWNER_CONTRIBUTION', label: 'Owner Contribution / Equity' },

  // --- Accounting Corrections ---
  { value: 'CREDIT_NOTE', label: 'Credit Note / Rental Waive' },
  { value: 'DEBIT_NOTE', label: 'Debit Note / Penalty Charge' },
];

export const TRANSACTION_CATEGORY_OPTIONS = [
  // --- Revenue Streams ---
  { value: 'RENT_REVENUE', label: 'Rental Income' },
  { value: 'SALE_PROCEEDS', label: 'Property Sale Proceeds' },
  { value: 'PREMIUM_FEE', label: 'Key Money / Premium Fee' },

  // --- Deposits & Liabilities ---
  { value: 'SECURITY_DEPOSIT', label: 'Security Deposit' },
  { value: 'HOLDING_DEPOSIT', label: 'Holding Deposit / Token Money' },
  { value: 'UTILITY_DEPOSIT', label: 'Utility Deposit (DEWA/Chiller)' },

  // --- Fees & Commissions ---
  { value: 'AGENCY_COMMISSION', label: 'Agency Commission / Brokerage' },
  { value: 'MANAGEMENT_FEE', label: 'Property Management Fee' },
  { value: 'LATE_FEE', label: 'Late Payment Penalty' },

  // --- Utilities & Operational Expenses ---
  { value: 'UTILITY_BILL', label: 'Utility Bill (DEWA/Water/Electricity)' },
  { value: 'CHILLER_COOLING', label: 'District Cooling / Chiller Fee' },
  { value: 'SERVICE_CHARGE', label: 'Community Service Charges / HOA' },
  { value: 'INSURANCE_PREMIUM', label: 'Property / Landlord Insurance' },

  // --- Maintenance & Capital Expenditures (CapEx) ---
  { value: 'MAINTENANCE_ROUTINE', label: 'Routine Maintenance / Repairs' },
  { value: 'MAINTENANCE_CAPEX', label: 'Property Renovation / Upgrades' },
  { value: 'CLEANING_TURNOVER', label: 'Cleaning & Move-out Turnover' },

  // --- Government & Legal Fees ---
  { value: 'GOVT_REGISTRATION', label: 'Government Fees (Ejari/DLD/Title Deed)' },
  { value: 'LEGAL_DISPUTE', label: 'Legal & RDC Tribunal Fees' },
  { value: 'TAX_VAT', label: 'VAT / Tax Payments' },

  // --- Owner & Equity Movements ---
  { value: 'OWNER_PAYOUT', label: 'Owner Distribution / Payout' },
  { value: 'FINANCING_MORTGAGE', label: 'Mortgage / Loan Payment' },

  { value: 'OTHER', label: 'Other Miscellaneous' },
];


export const PAYMENT_METHOD_OPTIONS = [
  // --- Traditional Physical Methods ---
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },

  // --- Push-Based Bank Transfers ---
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / Wire' },

  // --- Automated Direct Debits ---
  { value: 'DIRECT_DEBIT_UAEDDS', label: 'UAEDDS / Direct Debit' },
  { value: 'ACH_DIRECT_DEBIT', label: 'ACH Direct Debit (International)' },

  // --- Digital & Card Payments ---
  { value: 'CREDIT_DEBIT_CARD', label: 'Credit / Debit Card' },
  { value: 'DIGITAL_WALLET', label: 'Digital Wallet (Apple Pay / Google Pay)' },
  { value: 'PAYMENT_LINK', label: 'Online Payment Link' },

  // --- Internal Adjustments ---
  { value: 'LEDGER_SETTLEMENT', label: 'Ledger Offset / Contra Account' },
];


export const TRANSACTION_STATUS_OPTIONS = [
  // --- Initialization States ---
  { value: 'DRAFT', label: 'Draft / Quote' },
  { value: 'PENDING', label: 'Pending / Unpaid' },
  { value: 'PROCESSING', label: 'Processing / In-Flight' },

  // --- Real Estate Specific Held/Escrow States ---
  { value: 'HELD_IN_ESCROW', label: 'Held in Escrow' },
  { value: 'POST_DATED', label: 'Post-Dated (Holding)' },

  // --- Final Successful States ---
  { value: 'COMPLETED', label: 'Completed / Paid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },

  // --- Reversal & Failure States ---
  { value: 'BOUNCED_REJECTED', label: 'Bounced / Rejected' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'DISPUTED', label: 'Disputed / Chargeback' },
];


export const LEAD_STAGES = [
  { status: 'NEW', label: 'New Lead' },
  { status: 'QUALIFYING', label: 'Qualifying / Screening' },
  { status: 'CONTACTED', label: 'Contacted / Engaged' },
  { status: 'VIEWING_SCHEDULED', label: 'Viewing Scheduled' },
  { status: 'VIEWED', label: 'Viewing Completed' },
  { status: 'OFFER_MADE', label: 'Offer Submitted' },
  { status: 'NEGOTIATING', label: 'Negotiating' },
  { status: 'UNDER_CONTRACT', label: 'Deposit Paid / Contract Drafting' }, // Deal agreed, paperwork in progress
  { status: 'WON', label: 'Won & Closed' },
  { status: 'LOST', label: 'Lost' },
];

export const TEMPERATURE_STAGES = [
  { temperature: 'HOT', label: 'Hot', icon: 'fire' },            // High intent, immediate mover, financing ready
  { temperature: 'WARM', label: 'Warm', icon: 'sun' },           // Active buyer/tenant, still exploring options
  { temperature: 'COLD', label: 'Cold', icon: 'snowflake' },     // Low engagement, browsing, timeline > 6 months
  { temperature: 'NURTURE', label: 'Nurture', icon: 'sprout' },   // Not ready now, but good future prospect (replaced 'DEAD')
  { temperature: 'LOST_DEAD', label: 'Dead', icon: 'skull' },    // Invalid data, bought elsewhere, completely unresponsive
];


export const LEAD_STATUS_OPTIONS = LEAD_STAGES.map(({ status, label }) => ({ value: status, label }));

export const TEMPERATURE_OPTIONS = TEMPERATURE_STAGES.map(({ temperature, label }) => ({
  value: temperature,
  label,
}));

export const NONE_OPTION = { value: '', label: '-- None --' };



export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEASE_TYPE_OPTIONS = [
  // --- Standard Long-Term Leases ---
  { value: 'RESIDENTIAL', label: 'Residential (Long-Term)' },
  { value: 'COMMERCIAL_OFFICE', label: 'Commercial Office' },
  { value: 'COMMERCIAL_RETAIL', label: 'Commercial Retail / Shop' },

  // --- Short-Term & Hospitality ---
  { value: 'SHORT_TERM_HOLIDAY', label: 'Short-Term / Holiday Home' },
  { value: 'CO_LIVING', label: 'Co-Living / Shared Space' },

  // --- Industrial & Specialized ---
  { value: 'INDUSTRIAL_WAREHOUSE', label: 'Industrial / Warehouse' },
  { value: 'LAND_PLOT', label: 'Land / Plot Lease' },
  { value: 'MIXED_USE', label: 'Mixed-Use Property' },
];

export const MAINTENANCE_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },

  // --- Triage & Sourcing ---
  { value: 'OPEN_NEW', label: 'New / Unassigned' },
  { value: 'QUOTATION_STAGED', label: 'Awaiting Vendor Quotes' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval (Owner/Manager)' },

  // --- Execution & Access ---
  { value: 'SCHEDULED', label: 'Scheduled / Access Confirmed' },
  { value: 'IN_PROGRESS', label: 'In Progress / Work Underway' },
  { value: 'ON_HOLD_PARTS', label: 'On Hold (Awaiting Parts/Materials)' },

  // --- Closeout & Verification ---
  { value: 'PENDING_INSPECTION', label: 'Work Done / Pending Sign-Off' },
  { value: 'COMPLETED', label: 'Completed & Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];


export const MONTH_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
];

export const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

export const MAINTENANCE_CATEGORY_OPTIONS = [
  // --- Core MEP (Mechanical, Electrical, Plumbing) ---
  { value: 'PLUMBING', label: 'Plumbing / Water Systems' },
  { value: 'ELECTRICAL', label: 'Electrical / Power' },
  { value: 'HVAC', label: 'HVAC / Air Conditioning' },

  // --- Civil & Architectural ---
  { value: 'STRUCTURAL', label: 'Structural / Masonry / Civil' },
  { value: 'CARPENTRY_JOINERY', label: 'Carpentry, Doors & Locks' },
  { value: 'PAINTING_DECORATING', label: 'Painting & Wallcovering' },
  { value: 'FIT_OUT_FLOORING', label: 'Flooring, Tiles & Fit-out' },

  // --- Soft Services & Operations ---
  { value: 'CLEANING_DEEP', label: 'Cleaning & Deep Wash' },
  { value: 'PEST_CONTROL', label: 'Pest Control / Sanitisation' },
  { value: 'WASTE_MANAGEMENT', label: 'Waste Management / Garbage' },

  // --- Systems, Assets & Tech ---
  { value: 'APPLIANCE', label: 'Home Appliances / White Goods' },
  { value: 'SMART_HOME_ELV', label: 'ELV Systems, Intercom & Smart Home' },
  { value: 'FIRE_SAFETY', label: 'Fire Safety & Alarms' },
  { value: 'ELEVATOR_LIFT', label: 'Elevator / Lift Maintenance' },

  // --- Exterior & Landscaping ---
  { value: 'LANDSCAPING_GARDEN', label: 'Landscaping & Gardening' },
  { value: 'SWIMMING_POOL', label: 'Swimming Pool & Water Features' },
  { value: 'FACADE_ROOFING', label: 'Facade, Windows & Roofing' },

  // --- Lifecycle & Handover Inspections ---
  { value: 'SNAGGING_TURNOVER', label: 'Snagging / Move-in Move-out Prep' },

  { value: 'OTHER', label: 'Other Miscellaneous' },
];



export const SPECIALTY_OPTIONS = [
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'GENERAL', label: 'General' },
];


export const ALL_ROLES = [
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'accountant', label: 'Accountant' },
];


