import type { PaginationParams, PaginationMeta } from '~~/types/models/pagination';

export function createPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = Math.max(1, Math.min(page, totalPages || 1));

  return {
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}

/**
 * Helper to calculate offset from page and pageSize
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize;
}

/**
 * Helper to normalize pagination params with defaults
 */
export function normalizePaginationParams(
  params: PaginationParams = {},
  defaults: { page: number; pageSize: number; maxPageSize: number } = {
    page: 1,
    pageSize: 10,
    maxPageSize: 100,
  },
): Required<Omit<PaginationParams, 'maxPageSize'>> & { offset: number } {
  const page = Math.max(1, params.page || defaults.page);
  const pageSize = Math.min(
    Math.max(1, params.pageSize || defaults.pageSize),
    params.maxPageSize || defaults.maxPageSize,
  );

  return {
    page,
    pageSize,
    offset: calculateOffset(page, pageSize),
  };
}
