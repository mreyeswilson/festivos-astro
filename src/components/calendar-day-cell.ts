import type { HolidayItem } from '../lib/types';

export type CalendarDayCellLayout = 'compact' | 'month';

export interface CalendarDayCellProps {
  isoDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  holidays: HolidayItem[];
  layout: CalendarDayCellLayout;
  holidayAriaLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCalendarDayCell({
  isoDate,
  dayNumber,
  isCurrentMonth,
  isToday,
  holidays,
  layout,
  holidayAriaLabel
}: CalendarDayCellProps): string {
  const classes = ['day-cell', `day-cell--${layout}`];
  const holidayName = holidays[0]?.localName;
  const showHolidayName = layout === 'month' && Boolean(holidayName);

  if (!isCurrentMonth) classes.push('day-cell--muted');
  if (isToday) classes.push('day-cell--today');
  if (holidays.length > 0) classes.push('day-cell--holiday');
  if (showHolidayName) classes.push('day-cell--with-holiday-name');

  const buttonClasses = ['day-cell__button'];
  if (showHolidayName) buttonClasses.push('day-cell__button--with-holiday-name');

  const content = `
    <div class="day-cell__main">
      <span class="day-cell__number">${dayNumber}</span>
    </div>
    ${
      showHolidayName
        ? `<span class="day-cell__holiday-name">${escapeHtml(holidayName!)}</span>`
        : ''
    }
    ${holidays.length > 0 ? '<span class="sr-only">Festivo</span>' : ''}
  `;

  return `
    <article class="${classes.join(' ')}" aria-label="${escapeHtml(isoDate)}">
      ${
        holidays.length > 0
          ? `<button type="button" class="${buttonClasses.join(' ')}" data-holiday-open="${escapeHtml(isoDate)}" aria-label="${escapeHtml(holidayAriaLabel)}">${content}</button>`
          : `<div class="${buttonClasses.join(' ')} day-cell__button--static">${content}</div>`
      }
    </article>
  `;
}
