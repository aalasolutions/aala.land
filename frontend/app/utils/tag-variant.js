// Woven::Tag variant per domain value; keys are the lowercased enum value. `secondary` renders the kit gray.
const TAG_VARIANTS = {
  // LEAD_STAGES
  lead: {
    new: 'info',
    contacted: 'info',
    viewing: 'warning',
    negotiating: 'warning',
    won: 'success',
    lost: 'danger',
  },
  // TEMPERATURE_STAGES
  temp: {
    hot: 'danger',
    warm: 'warning',
    cold: 'info',
    dead: 'secondary',
  },
  // TRANSACTION_STATUS_OPTIONS
  txn: {
    pending: 'warning',
    completed: 'success',
    cancelled: 'secondary',
    failed: 'danger',
  },
  // FILTER_STATUS_OPTIONS (commissions)
  commission: {
    pending: 'warning',
    approved: 'info',
    paid: 'success',
  },
  // PROPERTY_STATUS_OPTIONS
  unit: {
    available: 'success',
    rented: 'info',
    sold: 'secondary',
    maintenance: 'warning',
  },
  // PROPERTY_TYPE_OPTIONS + PROPERTY_SUB_TYPES
  proptype: {
    rental: 'info',
    for_sale: 'success',
    apartment: 'secondary',
    villa: 'secondary',
    townhouse: 'secondary',
    penthouse: 'secondary',
    office_space: 'secondary',
    retail_store: 'secondary',
    warehouse: 'secondary',
    land_plot: 'secondary',
  },
  // MAINTENANCE_STATUS_OPTIONS
  wo: {
    open: 'info',
    in_progress: 'brand',
    pending_approval: 'warning',
    completed: 'success',
    cancelled: 'secondary',
  },
  // PRIORITY_OPTIONS (not a status).
  priority: {
    low: 'secondary',
    medium: 'info',
    high: 'warning',
    urgent: 'danger',
  },
  // MAINTENANCE_CATEGORY_OPTIONS + SPECIALTY_OPTIONS
  trade: {
    plumbing: 'info',
    electrical: 'warning',
    hvac: 'info',
    structural: 'secondary',
    cleaning: 'success',
    pest_control: 'warning',
    appliance: 'info',
    painting: 'info',
    general: 'secondary',
    other: 'secondary',
  },
  // CHEQUE_TYPE_OPTIONS
  cheque: {
    rent: 'info',
    security_deposit: 'info',
    maintenance: 'warning',
    other: 'secondary',
  },
  // Cheque lifecycle; not in constants.js, tracked in a migration instead.
  chequestate: {
    pending: 'warning',
    deposited: 'info',
    cleared: 'success',
    bounced: 'danger',
    cancelled: 'secondary',
    replaced: 'secondary',
  },
  // TRANSACTION_TYPE_OPTIONS
  txntype: {
    income: 'success',
    expense: 'danger',
  },
  // TRANSACTION_CATEGORY_OPTIONS
  txncat: {
    rent: 'info',
    sale: 'success',
    deposit: 'info',
    maintenance: 'warning',
    commission: 'brand',
    other: 'secondary',
  },
  // COMMISSION_TYPE_OPTIONS
  commtype: {
    sale: 'success',
    rental: 'info',
    referral: 'info',
  },
  // CONTACT_TYPES
  contact: {
    lead: 'warning',
    tenant: 'info',
    owner: 'success',
    portfolio_owner: 'info',
    other: 'secondary',
  },
  // CATEGORIES (documents)
  doc: {
    lease: 'info',
    tenancy_registration: 'brand',
    title_deed: 'success',
    id_copy: 'secondary',
    noc: 'warning',
    insurance: 'info',
    maintenance: 'warning',
    invoice: 'danger',
    receipt: 'success',
    other: 'secondary',
  },
  // ACCESS_LEVELS
  access: {
    team: 'info',
    admin: 'warning',
  },
  // EMAIL_CATEGORIES
  email: {
    follow_up: 'info',
    welcome: 'success',
    lease_renewal: 'brand',
    payment_reminder: 'warning',
    maintenance_update: 'info',
    marketing: 'danger',
    custom: 'secondary',
  },
  // LEASE_TYPE_OPTIONS
  lease: {
    residential: 'info',
    commercial: 'info',
    active: 'success',
    expired: 'secondary',
    terminated: 'danger',
    pending: 'warning',
  },
  // Subscription tiers
  plan: {
    free: 'secondary',
    starter: 'info',
    growth: 'success',
    pro: 'success',
    scale: 'brand',
    enterprise: 'info',
  },
  // Stripe and Paddle spell it `canceled`; both spellings are listed.
  sub: {
    active: 'success',
    trialing: 'success',
    past_due: 'warning',
    paused: 'warning',
    incomplete: 'warning',
    incomplete_expired: 'danger',
    unpaid: 'danger',
    cancelled: 'secondary',
    canceled: 'secondary',
  },
  // Any record with an `isActive` boolean.
  enabled: {
    active: 'success',
    inactive: 'secondary',
  },
  // Audit log actions. From the backend audit trail, not constants.js.
  audit: {
    create: 'success',
    update: 'info',
    delete: 'danger',
    assign: 'info',
    login: 'secondary',
    logout: 'secondary',
    import: 'warning',
    export: 'brand',
  },
  // Derived in `controllers/admin/companies/company.js`'s `statusView`.
  account: {
    locked: 'danger',
    lifted: 'warning',
    on_deal: 'warning',
    active: 'success',
  },
};

export function tagVariant(domain, value) {
  if (value === null || value === undefined) return undefined;
  const key = String(value).toLowerCase();
  return Object.hasOwn(TAG_VARIANTS[domain] ?? {}, key)
    ? TAG_VARIANTS[domain][key]
    : undefined;
}

export default TAG_VARIANTS;
