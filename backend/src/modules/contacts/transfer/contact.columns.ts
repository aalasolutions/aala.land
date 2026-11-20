import type { ColumnDef, ParseOutcome } from '@shared/spreadsheet/column-def';

const TRUE_WORDS = ['yes', 'true', '1'];
const FALSE_WORDS = ['no', 'false', '0'];

export const WHATSAPP_VALUES = ['Yes', 'No'] as const;

function parseWhatsapp(raw: string): ParseOutcome {
  const word = raw.trim().toLowerCase();
  if (TRUE_WORDS.includes(word)) return { value: true };
  if (FALSE_WORDS.includes(word)) return { value: false };
  return { error: 'Use Yes or No.' };
}

// Mirrors contact.entity.ts column lengths; First Name and Phone are required, as on the contact form.
export const CONTACT_COLUMNS: ColumnDef[] = [
  {
    header: 'First Name',
    key: 'firstName',
    type: 'string',
    required: true,
    requiredReason: 'Enter a first name.',
    maxLength: 100,
  },
  { header: 'Last Name', key: 'lastName', type: 'string', maxLength: 100 },
  {
    header: 'Phone',
    key: 'phone',
    type: 'string',
    required: true,
    requiredReason: 'Enter a phone number.',
    maxLength: 50,
  },
  { header: 'Email', key: 'email', type: 'string', maxLength: 255 },
  {
    header: 'WhatsApp',
    key: 'isWhatsapp',
    type: 'boolean',
    enumValues: WHATSAPP_VALUES,
    parse: parseWhatsapp,
  },
  { header: 'Nationality', key: 'nationality', type: 'string', maxLength: 100 },
  { header: 'National ID', key: 'nationalId', type: 'string', maxLength: 50 },
  { header: 'Company', key: 'contactCompany', type: 'string', maxLength: 200 },
  { header: 'Job Title', key: 'jobTitle', type: 'string', maxLength: 100 },
  { header: 'Address', key: 'address', type: 'string' },
  { header: 'Notes', key: 'notes', type: 'string' },
  { header: 'Region', key: 'regionCode', type: 'enum', maxLength: 50 },
];

// Present in exports only; an uploaded file may carry them and they are dropped on import.
export const CONTACT_EXPORT_ONLY_COLUMNS: ColumnDef[] = [
  { header: 'Created At', key: 'createdAt', type: 'string' },
];

export const CONTACT_EXPORT_ONLY_HEADERS: readonly string[] =
  CONTACT_EXPORT_ONLY_COLUMNS.map((column) => column.header);

export const CONTACT_TEMPLATE_EXAMPLE: Record<string, string> = {
  firstName: 'Sara',
  lastName: 'Al Mansoori',
  phone: '+966501234567',
  email: 'sara@example.com',
  isWhatsapp: 'Yes',
  nationality: 'Saudi',
  nationalId: '1234567890',
  contactCompany: 'Example Trading',
  jobTitle: 'Owner',
  address: 'King Fahd Road, Riyadh',
  notes: 'Prefers calls after 5 PM',
  regionCode: '',
};
