'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { useAsync, useDebounced } from './hooks';
import type { Paged } from './types';

/**
 * Server-side paged + searchable list. Changing the search text or any
 * filter jumps back to page 1. Accepts old array responses too.
 */
export function usePagedList<T>(path: string, filters: Record<string, string | number | undefined> = {}, opts: { pageSize?: number; enabled?: boolean } = {}) {
  const pageSize = opts.pageSize ?? 25;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [q, filterKey]);
  const res = useAsync(
    () =>
      api.get<Paged<T> | T[]>(path, { ...filters, q: q || undefined, page, pageSize }).then((r) =>
        Array.isArray(r) ? { items: r, total: r.length, page: 1, pageSize: r.length || pageSize } : r,
      ),
    [path, filterKey, q, page, pageSize],
    opts.enabled ?? true,
  );
  return {
    ...res,
    items: res.data?.items ?? [],
    total: res.data?.total ?? 0,
    page,
    pageSize,
    setPage,
    search,
    setSearch,
    searching: q.length > 0,
  };
}

/** For dropdowns that need "all" rows (bounded at the API max of 200). */
export function fetchAll<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  return api.get<Paged<T> | T[]>(path, { ...params, pageSize: 200 }).then((r) => (Array.isArray(r) ? r : r.items));
}
