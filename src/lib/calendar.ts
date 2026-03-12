import type { HolidayItem } from './types';

const LOCALE = 'es-CO';
const APP_TIME_ZONE = 'America/Bogota';

function isoDateInTimeZone(date: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('No fue posible resolver la fecha actual con zona horaria.');
  }

  return `${year}-${month}-${day}`;
}

export interface DayCell {
  key: string;
  isoDate: string;
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  holidays: HolidayItem[];
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function todayIsoDate(): string {
  return isoDateInTimeZone(new Date());
}

export function todayDate(): Date {
  return parseIsoDate(todayIsoDate());
}

export function toIsoDate(date: Date): string {
  return toUtcDate(date).toISOString().slice(0, 10);
}

export function startOfWeek(date: Date): Date {
  const utcDate = toUtcDate(date);
  const day = utcDate.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diff);
  return utcDate;
}

export function addDays(date: Date, amount: number): Date {
  const next = toUtcDate(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

export function addYears(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + amount, date.getUTCMonth(), date.getUTCDate()));
}

export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function shortMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function weekLabel(date: Date): string {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const startLabel = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(start);
  const endLabel = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(end);

  return `${startLabel} - ${endLabel}`;
}

export function fullDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function weekdayLabels(): string[] {
  const baseMonday = new Date(Date.UTC(2024, 0, 1));
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(LOCALE, {
      weekday: 'short',
      timeZone: 'UTC'
    }).format(addDays(baseMonday, index))
  );
}

export function buildMonthGrid(year: number, monthIndex: number, holidayMap: Map<string, HolidayItem[]>): DayCell[] {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const firstGridDay = startOfWeek(monthStart);
  const today = todayIsoDate();

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(firstGridDay, index);
    const isoDate = toIsoDate(date);

    return {
      key: `${year}-${monthIndex}-${isoDate}`,
      isoDate,
      date,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === monthIndex,
      isToday: isoDate === today,
      holidays: holidayMap.get(isoDate) ?? []
    };
  });
}

export function groupHolidaysByDate(holidays: HolidayItem[]): Map<string, HolidayItem[]> {
  return holidays.reduce((map, holiday) => {
    const current = map.get(holiday.date) ?? [];
    current.push(holiday);
    map.set(holiday.date, current);
    return map;
  }, new Map<string, HolidayItem[]>());
}

export function nextHoliday(holidays: HolidayItem[], fromDate: Date): HolidayItem | null {
  const todayIso = isoDateInTimeZone(fromDate);
  return holidays.find((holiday) => holiday.date >= todayIso) ?? null;
}

export function holidaysForMonth(holidays: HolidayItem[], year: number, monthIndex: number): HolidayItem[] {
  return holidays.filter((holiday) => holiday.year === year && holiday.month === monthIndex + 1);
}

export function holidaysForWeek(holidays: HolidayItem[], focusDate: Date): HolidayItem[] {
  const start = toIsoDate(startOfWeek(focusDate));
  const end = toIsoDate(addDays(startOfWeek(focusDate), 6));
  return holidays.filter((holiday) => holiday.date >= start && holiday.date <= end);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
