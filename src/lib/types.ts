export type CalendarView = 'year' | 'month' | 'week';

export interface HolidayApiRecord {
  date: string;
  day_of_week_es?: string;
  day_of_week_en?: string;
  day_of_week_iso?: number;
  name_es: string;
  name_en?: string;
}

export interface HolidaysApiResponse {
  query?: Record<string, string>;
  year?: string | number | null;
  total?: number;
  data: HolidayApiRecord[];
}

export interface HolidayItem {
  id: string;
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  localName: string;
  name: string;
  label: string;
  types: string[];
  image?: string;
  history?: string;
}

export interface HolidayAppPayload {
  initialYear: number;
  initialView: CalendarView;
  initialHolidays: HolidayItem[];
  initialError: string | null;
}
