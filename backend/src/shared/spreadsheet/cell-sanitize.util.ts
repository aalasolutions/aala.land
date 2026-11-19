const FORMULA_LEAD = /^[=@\t\r]/;
const SIGN_LEAD = /^[+-]/;
// A sign followed only by digits, spaces, parentheses and dashes is a phone number, not a formula.
const PHONE_SHAPE = /^[+-][\d\s()-]*$/;

// Export: a text cell that a spreadsheet would run as a formula gets a leading apostrophe.
export function sanitizeForExport(value: string): string {
  if (FORMULA_LEAD.test(value)) return `'${value}`;
  if (SIGN_LEAD.test(value) && !PHONE_SHAPE.test(value)) return `'${value}`;
  return value;
}

// Import: one leading apostrophe is the escape added above and is not data.
export function sanitizeFromImport(value: string): string {
  return value.startsWith("'") ? value.slice(1) : value;
}
