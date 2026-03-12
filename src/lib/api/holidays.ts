import type { HolidayApiRecord, HolidayItem, HolidaysApiResponse } from '../types';

const API_URL = 'https://www.festivos.com.co/api/v1/festivos';
const API_KEY = 'fs_GnKwlQYiJqTl7DMRmbkTqkEsHWASJPoH';
const DEFAULT_HOLIDAY_TYPES = ['Oficial'];
const holidayCache = new Map<number, Promise<HolidayItem[]>>();

function toIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value.replace(/\s+\([^)]*\)\s*$/, ''));

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`La API devolvio una fecha invalida: ${value}`);
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())).toISOString().slice(0, 10);
}

function normalizeHoliday(record: HolidayApiRecord): HolidayItem {
  const date = toIsoDate(record.date);
  const [year, month, day] = date.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const localName = (record.name_es ?? '').trim();
  const fallbackName = localName || (record.name_en ?? '').trim() || 'Festivo';
  const name = (record.name_en ?? '').trim() || fallbackName;

  return {
    id: `${date}-${fallbackName}`,
    date,
    year,
    month,
    day,
    weekday: utcDate.getUTCDay(),
    localName: fallbackName,
    name,
    label: fallbackName,
    types: DEFAULT_HOLIDAY_TYPES
  };
}

function readPayloadData(payload: unknown): HolidayApiRecord[] {
  if (Array.isArray(payload)) {
    return payload as HolidayApiRecord[];
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as HolidaysApiResponse).data)) {
    return (payload as HolidaysApiResponse).data;
  }

  throw new Error('La API de festivos devolvio un formato inesperado.');
}

async function requestHolidays(year: number, signal?: AbortSignal): Promise<HolidayItem[]> {
  const searchParams = new URLSearchParams({
    api_key: API_KEY,
    year: String(year)
  });

  const response = await fetch(`${API_URL}?${searchParams.toString()}`, {
    headers: {
      Accept: 'application/json'
    },
    signal
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Credenciales invalidas al consultar la API de festivos.');
    }

    throw new Error(`No fue posible consultar la API de festivos. Codigo ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  const records = readPayloadData(payload);

  return records
    .map(normalizeHoliday)
    .filter((holiday) => holiday.year === year)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function fetchHolidaysForYear(year: number, signal?: AbortSignal): Promise<HolidayItem[]> {
  if (!holidayCache.has(year)) {
    const request = requestHolidays(year, signal).catch((error) => {
      holidayCache.delete(year);
      throw error;
    });

    holidayCache.set(year, request);
  }

  return holidayCache.get(year)!;
}

export async function fetchHolidayRange(years: number[], signal?: AbortSignal): Promise<Map<number, HolidayItem[]>> {
  const uniqueYears = [...new Set(years)];
  const entries = await Promise.all(
    uniqueYears.map(async (year) => [year, await fetchHolidaysForYear(year, signal)] as const)
  );

  return new Map(entries);
}

export function invalidateHolidayYear(year: number): void {
  holidayCache.delete(year);
}
