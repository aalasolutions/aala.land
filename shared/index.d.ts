// Type declarations for @land/taxonomies.
// The runtime source (index.js, ESM) is authoritative. The frontend imports it
// directly; the backend consumes the CommonJS build (dist/index.cjs).

type LabeledValue = { value: string; label: string };

export declare const AMENITY_OPTIONS: {
  key: string;
  label: string;
  icon: string;
}[];
export declare const PROPERTY_STATUS_OPTIONS: LabeledValue[];
export declare const PROPERTY_FILTER_STATUS_OPTIONS: LabeledValue[];
export declare const PROPERTY_TYPE_OPTIONS: LabeledValue[];
export declare const PROPERTY_SUB_TYPES: LabeledValue[];
export declare const FILTER_TYPE_OPTIONS: LabeledValue[];
export declare const FILTER_BEDS_OPTIONS: LabeledValue[];
export declare const CHEQUE_TYPE_OPTIONS: LabeledValue[];
export declare const EMPTY_UNIT_OPTION: LabeledValue;
export declare const FILTER_STATUS_OPTIONS: LabeledValue[];
export declare const COMMISSION_TYPE_OPTIONS: LabeledValue[];
export declare const CONTACT_TYPES: LabeledValue[];
export declare const CATEGORIES: LabeledValue[];
export declare const ACCESS_LEVELS: LabeledValue[];
export declare const EMAIL_CATEGORIES: LabeledValue[];
export declare const EMAIL_FILTER_CATEGORIES: LabeledValue[];
export declare const TRANSACTION_TYPE_OPTIONS: LabeledValue[];
export declare const TRANSACTION_CATEGORY_OPTIONS: LabeledValue[];
export declare const PAYMENT_METHOD_OPTIONS: LabeledValue[];
export declare const TRANSACTION_STATUS_OPTIONS: LabeledValue[];
export declare const LEAD_STAGES: { status: string; label: string }[];
export declare const TEMPERATURE_STAGES: {
  temperature: string;
  label: string;
  icon: string;
}[];
export declare const LEAD_STATUS_OPTIONS: LabeledValue[];
export declare const TEMPERATURE_OPTIONS: LabeledValue[];
export declare const NONE_OPTION: LabeledValue;
export declare const UUID_PATTERN: RegExp;
export declare const LEASE_TYPE_OPTIONS: LabeledValue[];
export declare const MAINTENANCE_STATUS_OPTIONS: LabeledValue[];
export declare const MONTH_OPTIONS: LabeledValue[];
export declare const PRIORITY_OPTIONS: LabeledValue[];
export declare const MAINTENANCE_CATEGORY_OPTIONS: LabeledValue[];
export declare const ALL_ROLES: LabeledValue[];

// Authored lists (fields that had no frontend constant).
export declare const CHEQUE_STATUS_OPTIONS: LabeledValue[];
export declare const LEAD_SOURCE_OPTIONS: LabeledValue[];
export declare const LEASE_STATUS_OPTIONS: LabeledValue[];
export declare const SCHEDULE_FREQUENCY_OPTIONS: LabeledValue[];
export declare const ACTIVITY_TYPE_OPTIONS: LabeledValue[];
export declare const NOTIFICATION_TYPES: LabeledValue[];
export declare const COMMISSION_STATUS_OPTIONS: LabeledValue[];
export declare const ROLE_VALUES: LabeledValue[];
