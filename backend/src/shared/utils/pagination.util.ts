import {
  CONTACT_LIST_MAX_LIMIT,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../constants/pagination';

// Every list clamps here, so an oversized or negative limit never reaches the query.
export function clampLimit(limit = DEFAULT_PAGE_LIMIT): number {
  const value = Math.trunc(Number(limit)) || DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(value, 1), MAX_PAGE_LIMIT);
}

export function clampPage(page = 1): number {
  return Math.max(Math.trunc(Number(page)) || 1, 1);
}

export function paginationOptions(
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
): { skip: number; take: number } {
  const take = clampLimit(limit);
  return { skip: (clampPage(page) - 1) * take, take };
}

export function pageSkip(page = 1, limit = DEFAULT_PAGE_LIMIT): number {
  return (clampPage(page) - 1) * clampLimit(limit);
}

// Contacts and leads lists stop at 100 rows per page, below the shared 500 clamp.
export function contactListLimit(limit = DEFAULT_PAGE_LIMIT): number {
  return Math.min(clampLimit(limit), CONTACT_LIST_MAX_LIMIT);
}
