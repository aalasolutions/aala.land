export const AMENITY_OPTIONS = [
  { key: 'security', label: '24/7 Security', icon: 'shield-check' },
  { key: 'ac', label: 'AC', icon: 'snowflake' },
  { key: 'balcony', label: 'Balcony', icon: 'sun-horizon' },
  { key: 'bbq_area', label: 'BBQ Area', icon: 'fire' },
  {
    key: 'built_in_wardrobes',
    label: 'Built-in Wardrobes',
    icon: 'coat-hanger',
  },
  { key: 'children_play_area', label: 'Children Play Area', icon: 'baby' },
  { key: 'concierge', label: 'Concierge', icon: 'bell-ringing' },
  { key: 'elevator', label: 'Elevator', icon: 'elevator' },
  { key: 'ev_charging', label: 'EV Charging', icon: 'charging-station' },
  { key: 'furnished', label: 'Furnished', icon: 'couch' },
  { key: 'garden', label: 'Garden', icon: 'plant' },
  { key: 'gym', label: 'Gym', icon: 'barbell' },
  { key: 'heating', label: 'Heating', icon: 'thermometer-hot' },
  { key: 'jacuzzi', label: 'Jacuzzi', icon: 'bathtub' },
  {
    key: 'kitchen_appliances',
    label: 'Kitchen Appliances',
    icon: 'cooking-pot',
  },
  { key: 'laundry', label: 'Laundry', icon: 'washing-machine' },
  { key: 'maid_service', label: 'Maid Service', icon: 'broom' },
  { key: 'maids_room', label: 'Maids Room', icon: 'bed' },
  { key: 'covered_parking', label: 'Parking: Covered', icon: 'garage' },
  { key: 'free_parking', label: 'Parking: Free', icon: 'car' },
  { key: 'paid_parking', label: 'Parking: Paid', icon: 'car-profile' },
  { key: 'pet_friendly', label: 'Pet Friendly', icon: 'dog' },
  { key: 'private_pool', label: 'Pool: Private', icon: 'swimming-pool' },
  { key: 'pool', label: 'Pool: Shared', icon: 'swimming-pool' },
  { key: 'power_backup', label: 'Power Backup', icon: 'lightning' },
  { key: 'spa', label: 'Spa', icon: 'flower-lotus' },
  { key: 'storage', label: 'Storage', icon: 'archive-box' },
  { key: 'study_room', label: 'Study Room', icon: 'book-open' },
  { key: 'terrace', label: 'Terrace', icon: 'umbrella-simple' },
  { key: 'city_view', label: 'View: City', icon: 'buildings' },
  { key: 'sea_view', label: 'View: Sea', icon: 'waves' },
  { key: 'walk_in_closet', label: 'Walk-in Closet', icon: 'door-open' },
  {
    key: 'wheelchair_accessible',
    label: 'Wheelchair Accessible',
    icon: 'wheelchair',
  },
  { key: 'wifi', label: 'WiFi', icon: 'wifi-high' },
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

// "All" first and "Other" last; the rest alphabetical.
export const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'INSURANCE', label: 'Insurance Policy' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'LEASE', label: 'Lease / Tenancy Contract' },
  { value: 'MAINTENANCE', label: 'Maintenance & Snagging' },
  { value: 'NOC', label: 'No Objection Certificate (NOC)' },
  { value: 'ID_COPY', label: 'Passport Copy' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'TENANCY_REGISTRATION', label: 'Tenancy Registration' },
  { value: 'TITLE_DEED', label: 'Title Deed' },
  { value: 'OTHER', label: 'Other Documents' },
];

export const ACCESS_LEVELS = [
  { value: 'TEAM', label: 'Share with Team' },
  { value: 'ADMIN', label: 'Share with Admin' },
];

// Values match the documents list `related` query param.
export const RELATED_TYPES = [
  { value: '', label: 'All' },
  { value: 'none', label: 'Library only' },
  { value: 'contact', label: 'Contact' },
  { value: 'lease', label: 'Lease' },
  { value: 'asset', label: 'Property' },
  { value: 'unit', label: 'Unit' },
  { value: 'work_order', label: 'Work Order' },
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

// Mirrors MAX_BACKDATE_DAYS in backend transaction-date-window.util.ts.
export const MAX_BACKDATE_DAYS = 30;

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

export const LEAD_SOURCE_OPTIONS = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'OTHER', label: 'Other' },
];

export const NONE_OPTION = { value: '', label: '-- None --' };

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEASE_TYPE_OPTIONS = [
  { value: 'RESIDENTIAL', label: 'Residential (Long-Term)' },
  { value: 'COMMERCIAL', label: 'Commercial Office' },
];

export const LEASE_STATUS_OPTIONS = [
  { id: '', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'EXPIRED', label: 'Expired' },
  { id: 'TERMINATED', label: 'Terminated' },
  { id: 'RENEWED', label: 'Renewed' },
];

// Leases send a different archived value, so ARCHIVED_FILTER_OPTIONS is not shared.
export const LEASE_ARCHIVED_OPTIONS = [
  { value: '', label: 'Active' },
  { value: 'only', label: 'Archived' },
  { value: 'include', label: 'All' },
];

// Shared by properties/index and properties/detail (both send archived=exclude/only/include).
export const ARCHIVED_FILTER_OPTIONS = [
  { value: 'exclude', label: 'Active' },
  { value: 'only', label: 'Archived' },
  { value: 'include', label: 'All' },
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

// Alphabetical, "Other" last.
export const MAINTENANCE_CATEGORY_OPTIONS = [
  { value: 'CLEANING', label: 'Cleaning & Deep Wash' },
  { value: 'ELECTRICAL', label: 'Electrical / Power' },
  { value: 'APPLIANCE', label: 'Home Appliances / White Goods' },
  { value: 'HVAC', label: 'HVAC / Air Conditioning' },
  { value: 'PEST_CONTROL', label: 'Pest Control / Sanitisation' },
  { value: 'PLUMBING', label: 'Plumbing / Water Systems' },
  { value: 'STRUCTURAL', label: 'Structural / Masonry / Civil' },
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

export const HISTORY_ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'DELETE', label: 'Deleted' },
  { value: 'ARCHIVE', label: 'Archived' },
  { value: 'UNARCHIVE', label: 'Unarchived' },
  { value: 'CANCEL', label: 'Cancelled' },
  { value: 'REPLACE', label: 'Replaced' },
  { value: 'BOUNCE', label: 'Bounced' },
  { value: 'STATUS_CHANGE', label: 'Status changed' },
  { value: 'TERMINATE', label: 'Terminated' },
  { value: 'DEACTIVATE', label: 'Deactivated' },
  { value: 'REACTIVATE', label: 'Reactivated' },
];

export const HISTORY_ACTION_VARIANTS = {
  DELETE: 'danger',
  CANCEL: 'danger',
  BOUNCE: 'danger',
  TERMINATE: 'danger',
  DEACTIVATE: 'danger',
  ARCHIVE: 'warning',
  REPLACE: 'warning',
  UNARCHIVE: 'success',
  REACTIVATE: 'success',
  STATUS_CHANGE: 'info',
};

export const HISTORY_ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'Unit', label: 'Property' },
  { value: 'Asset', label: 'Asset' },
  { value: 'Lease', label: 'Lease' },
  { value: 'Contact', label: 'Contact' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'WorkOrder', label: 'Work Order' },
  { value: 'Commission', label: 'Commission' },
  { value: 'User', label: 'User' },
];

export const optionLabelFor = (options, value) =>
  options.find((o) => o.value === value)?.label ?? value;
