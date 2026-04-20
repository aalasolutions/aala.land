export function paginationOptions(page = 1, limit = 20): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export function pageSkip(page = 1, limit = 20): number {
  return (page - 1) * limit;
}
