import { Raw } from 'typeorm';

export function sanitizeName(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
}

export function normalizedNameSql(alias: string): string {
    return `LOWER(regexp_replace(BTRIM(${alias}), '\\s+', ' ', 'g'))`;
}

export function normalizedNameWhere(name: string) {
    return Raw((alias) => `${normalizedNameSql(alias)} = LOWER(:name)`, { name });
}
