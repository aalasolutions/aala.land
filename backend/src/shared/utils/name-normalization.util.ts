import { Raw, QueryFailedError } from 'typeorm';

export function sanitizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function normalizedNameSql(alias: string): string {
  return `LOWER(regexp_replace(BTRIM(${alias}), '\\s+', ' ', 'g'))`;
}

export function normalizedNameWhere(name: string) {
  return Raw((alias) => `${normalizedNameSql(alias)} = LOWER(:name)`, { name });
}

export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: string } | undefined;
  return driverError?.code === '23505';
}
