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
  ...PROPERTY_STATUS_OPTIONS,
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
  { value: 'MAINTENANCE', label: 'Maintenance / Service Charges' },
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
  { value: 'OWNER', label: 'Owner / Landlord' },
  { value: 'VENDOR', label: 'Vendor / Contractor' },
  { value: 'OTHER', label: 'Other' },
];

export const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'LEASE', label: 'Lease / Tenancy Contract' },
  { value: 'EJARI', label: 'Ejari Certificate' },
  { value: 'TITLE_DEED', label: 'Title Deed' },
  { value: 'ID_COPY', label: 'Passport Copy' },
  { value: 'NOC', label: 'No Objection Certificate (NOC)' },
  { value: 'INSURANCE', label: 'Insurance Policy' },
  { value: 'MAINTENANCE', label: 'Maintenance & Snagging' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'RECEIPT', label: 'Receipt' },
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
  { value: 'INCOME', label: 'Income / Revenue' },
  { value: 'EXPENSE', label: 'Expense / Outflow' },
];

export const TRANSACTION_CATEGORY_OPTIONS = [
  { value: 'RENT', label: 'Rental Income' },
  { value: 'SALE', label: 'Property Sale Proceeds' },
  { value: 'DEPOSIT', label: 'Security Deposit' },
  { value: 'MAINTENANCE', label: 'Routine Maintenance / Repairs' },
  { value: 'COMMISSION', label: 'Agency Commission / Brokerage' },
  { value: 'OTHER', label: 'Other Miscellaneous' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / Wire' },
  { value: 'CREDIT_CARD', label: 'Credit / Debit Card' },
  { value: 'ONLINE', label: 'Online Payment Link' },
];

export const TRANSACTION_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending / Unpaid' },
  { value: 'COMPLETED', label: 'Completed / Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
];

export const LEAD_STAGES = [
  { status: 'NEW', label: 'New Lead' },
  { status: 'CONTACTED', label: 'Contacted / Engaged' },
  { status: 'VIEWING', label: 'Viewing Scheduled' },
  { status: 'NEGOTIATING', label: 'Negotiating' },
  { status: 'WON', label: 'Won & Closed' },
  { status: 'LOST', label: 'Lost' },
];

export const TEMPERATURE_STAGES = [
  { temperature: 'HOT', label: 'Hot', icon: 'fire' }, // High intent, immediate mover, financing ready
  { temperature: 'WARM', label: 'Warm', icon: 'sun' }, // Active buyer/tenant, still exploring options
  { temperature: 'COLD', label: 'Cold', icon: 'snowflake' }, // Low engagement, browsing, timeline > 6 months
  { temperature: 'DEAD', label: 'Dead', icon: 'skull' }, // Invalid data, bought elsewhere, completely unresponsive
];

export const LEAD_STATUS_OPTIONS = LEAD_STAGES.map(({ status, label }) => ({
  value: status,
  label,
}));

export const TEMPERATURE_OPTIONS = TEMPERATURE_STAGES.map(
  ({ temperature, label }) => ({
    value: temperature,
    label,
  }),
);

export const NONE_OPTION = { value: '', label: '-- None --' };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEASE_TYPE_OPTIONS = [
  { value: 'RESIDENTIAL', label: 'Residential (Long-Term)' },
  { value: 'COMMERCIAL', label: 'Commercial Office' },
];

export const MAINTENANCE_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'New / Unassigned' },
  { value: 'IN_PROGRESS', label: 'In Progress / Work Underway' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval (Owner/Manager)' },
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
  { value: 'PLUMBING', label: 'Plumbing / Water Systems' },
  { value: 'ELECTRICAL', label: 'Electrical / Power' },
  { value: 'HVAC', label: 'HVAC / Air Conditioning' },
  { value: 'STRUCTURAL', label: 'Structural / Masonry / Civil' },
  { value: 'CLEANING', label: 'Cleaning & Deep Wash' },
  { value: 'PEST_CONTROL', label: 'Pest Control / Sanitisation' },
  { value: 'APPLIANCE', label: 'Home Appliances / White Goods' },
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
