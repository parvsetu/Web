'use client';

import { api } from './api';
import { useAsync } from './hooks';

export interface IndianState {
  code: string;
  name: string;
  type: 'STATE' | 'UT';
  cities: string[];
}

export interface FestivalTypeDef {
  key: string;
  label: string;
  defaultPrefix: string;
  group: string;
  months?: string;
}

// Static reference data: fetched once per page load and shared.
let statesP: Promise<IndianState[]> | null = null;
let festivalsP: Promise<FestivalTypeDef[]> | null = null;
let categoriesP: Promise<string[]> | null = null;

const once = <T,>(get: () => Promise<T>, reset: () => void) => get().catch((e) => { reset(); throw e; });

export function useIndianStates() {
  return useAsync(() => (statesP ??= once(() => api.get<IndianState[]>('/public/locations', undefined, { noAuthRedirect: true }), () => (statesP = null))), []);
}

export function useFestivalTypes() {
  return useAsync(() => (festivalsP ??= once(() => api.get<FestivalTypeDef[]>('/public/festival-types', undefined, { noAuthRedirect: true }), () => (festivalsP = null))), []);
}

export function useExpenseCategories() {
  return useAsync(() => (categoriesP ??= once(() => api.get<string[]>('/public/expense-categories', undefined, { noAuthRedirect: true }), () => (categoriesP = null))), []);
}
