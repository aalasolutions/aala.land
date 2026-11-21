import type { ColumnDef, ParseOutcome } from '@shared/spreadsheet/column-def';
import { UnitStatus } from '../entities/unit.entity';
import { UnitSubType } from '../entities/unit-sub-type.enum';
import { PropertyType } from '../entities/property-type.enum';
import { AMENITY_KEYS } from '../amenity-keys';

export const AMENITY_SEPARATOR = ';';

export const UNIT_SUB_TYPE_VALUES = Object.values(UnitSubType);
export const UNIT_STATUS_VALUES = Object.values(UnitStatus);
export const LISTING_TYPE_VALUES = Object.values(PropertyType);

function formatAmenities(value: unknown): string {
  return Array.isArray(value) ? value.join(AMENITY_SEPARATOR) : String(value);
}

// Spaces and dashes read as underscores, so "Office Space" matches OFFICE_SPACE.
function enumWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function parseEnum(values: readonly string[]) {
  return (raw: string): ParseOutcome => {
    const word = enumWord(raw);
    const value = values.find((candidate) => enumWord(candidate) === word);
    return value ? { value } : { error: `Use one of: ${values.join(', ')}.` };
  };
}

function parseNumber(raw: string): ParseOutcome {
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? { value } : { error: 'Enter a number.' };
}

function parseInteger(raw: string): ParseOutcome {
  const outcome = parseNumber(raw);
  if (outcome.error) return { error: 'Enter a whole number.' };
  return Number.isInteger(outcome.value)
    ? outcome
    : { error: 'Enter a whole number.' };
}

function parseAmenities(raw: string): ParseOutcome {
  const keys = raw
    .split(AMENITY_SEPARATOR)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const unknown = keys.find((key) => !AMENITY_KEYS.includes(key));
  if (unknown) return { error: `Unknown amenity "${unknown}".` };
  return { value: Array.from(new Set(keys)) };
}

// Mirrors unit.entity.ts, asset.entity.ts and the locations entities; the region comes from the city.
export const UNIT_COLUMNS: ColumnDef[] = [
  {
    header: 'City',
    key: 'city',
    type: 'string',
    required: true,
    maxLength: 255,
  },
  {
    header: 'Locality',
    key: 'locality',
    type: 'string',
    required: true,
    maxLength: 255,
  },
  {
    header: 'Asset',
    key: 'asset',
    type: 'string',
    required: true,
    maxLength: 255,
  },
  {
    header: 'Unit Number',
    key: 'unitNumber',
    type: 'string',
    required: true,
    maxLength: 50,
  },
  {
    header: 'Sub Type',
    key: 'subType',
    type: 'enum',
    required: true,
    enumValues: UNIT_SUB_TYPE_VALUES,
    parse: parseEnum(UNIT_SUB_TYPE_VALUES),
  },
  {
    header: 'Status',
    key: 'status',
    type: 'enum',
    enumValues: UNIT_STATUS_VALUES,
    parse: parseEnum(UNIT_STATUS_VALUES),
  },
  {
    header: 'Listing Type',
    key: 'propertyType',
    type: 'enum',
    enumValues: LISTING_TYPE_VALUES,
    parse: parseEnum(LISTING_TYPE_VALUES),
  },
  { header: 'Price', key: 'price', type: 'number', parse: parseNumber },
  { header: 'Area (sq ft)', key: 'sqFt', type: 'number', parse: parseNumber },
  { header: 'Bedrooms', key: 'bedrooms', type: 'number', parse: parseInteger },
  { header: 'Bathrooms', key: 'bathrooms', type: 'number', parse: parseNumber },
  { header: 'Floor', key: 'floor', type: 'string', maxLength: 20 },
  {
    header: 'Amenities',
    key: 'amenities',
    type: 'string',
    enumValues: AMENITY_KEYS,
    parse: parseAmenities,
    format: formatAmenities,
  },
  { header: 'Description', key: 'description', type: 'string' },
  {
    header: 'Owner First Name',
    key: 'ownerFirstName',
    type: 'string',
    maxLength: 100,
  },
  {
    header: 'Owner Last Name',
    key: 'ownerLastName',
    type: 'string',
    maxLength: 100,
  },
  { header: 'Owner Phone', key: 'ownerPhone', type: 'string', maxLength: 50 },
  { header: 'Owner Email', key: 'ownerEmail', type: 'string', maxLength: 255 },
];

// Present in exports only; an uploaded file may carry them and they are dropped on import.
export const UNIT_EXPORT_ONLY_COLUMNS: ColumnDef[] = [
  { header: 'Created At', key: 'createdAt', type: 'string' },
];

export const UNIT_EXPORT_ONLY_HEADERS: readonly string[] =
  UNIT_EXPORT_ONLY_COLUMNS.map((column) => column.header);

export const UNIT_TEMPLATE_EXAMPLE: Record<string, string> = {
  city: 'Riyadh',
  locality: 'Al Olaya',
  asset: 'Olaya Towers',
  unitNumber: '1204',
  subType: UnitSubType.APARTMENT,
  status: UnitStatus.AVAILABLE,
  propertyType: PropertyType.RENTAL,
  price: '85000',
  sqFt: '1450',
  bedrooms: '2',
  bathrooms: '2.5',
  floor: '12',
  amenities: ['covered_parking', 'gym'].join(AMENITY_SEPARATOR),
  description: 'Corner unit with city view',
  ownerFirstName: 'Sara',
  ownerLastName: 'Al Mansoori',
  ownerPhone: '+966501234567',
  ownerEmail: 'sara@example.com',
};
