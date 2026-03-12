import { fetchHolidayRange, invalidateHolidayYear } from '../lib/api/holidays';
import { initFlowbite, Modal } from 'flowbite';
import { renderCalendarDayCell, type CalendarDayCellLayout } from '../components/calendar-day-cell';
import {
  addDays,
  addMonths,
  addYears,
  buildMonthGrid,
  fullDateLabel,
  groupHolidaysByDate,
  holidaysForMonth,
  holidaysForWeek,
  monthLabel,
  nextHoliday,
  parseIsoDate,
  shortMonthLabel,
  startOfWeek,
  todayDate,
  todayIsoDate,
  titleCase,
  toIsoDate,
  weekLabel,
  weekdayLabels
} from '../lib/calendar';
import type { CalendarView, HolidayAppPayload, HolidayItem } from '../lib/types';

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type StatusMode = 'ready' | 'loading' | 'error';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

class HolidayCalendarAppElement extends HTMLElement {
  private payload!: HolidayAppPayload;
  private view: CalendarView = 'year';
  private focusDate = new Date();
  private holidaysByYear = new Map<number, HolidayItem[]>();
  private currentHolidayMap = new Map<string, HolidayItem[]>();
  private installPromptEvent: BeforeInstallPromptEvent | null = null;
  private status: StatusMode = 'ready';
  private errorMessage: string | null = null;
  private abortController: AbortController | null = null;
  private modalInstance: Modal | null = null;
  private activeHolidayDate: Date | null = null;
  private modalTemplate!: HTMLTemplateElement;

  private periodLabel!: HTMLElement;
  private rangeLabel!: HTMLElement;
  private totalSummary: HTMLElement | null = null;
  private nextSummary!: HTMLElement;
  private nextSummaryCountdown!: HTMLElement;
  private nextSummaryStatus!: HTMLElement;
  private nextSummaryDate!: HTMLElement;
  private loadingOverlay!: HTMLElement;
  private feedbackNode!: HTMLElement;
  private viewRoot!: HTMLElement;
  private installButton!: HTMLButtonElement;
  private refreshButton!: HTMLButtonElement;
  private mobileViewLabel: HTMLElement | null = null;
  private modalRoot: HTMLElement | null = null;
  private modalTitle: HTMLElement | null = null;
  private modalCountdown: HTMLElement | null = null;
  private modalDate: HTMLElement | null = null;
  private modalLocalName: HTMLElement | null = null;
  private modalName: HTMLElement | null = null;
  private modalTypes: HTMLElement | null = null;
  private modalList: HTMLElement | null = null;
  private modalScrollBody: HTMLElement | null = null;
  private canvas!: HTMLCanvasElement;
  private animationFrame = 0;
  private nextSummaryHolidayIso: string | null = null;
  private nextSummaryIntervalId: number | null = null;
  private particles: Array<{ x: number; y: number; vx: number; vy: number; radius: number; alpha: number }> = [];

  connectedCallback(): void {
    this.payload = this.readPayload();
    this.view = this.payload.initialView;
    const today = todayDate();
    this.focusDate = new Date(Date.UTC(this.payload.initialYear, today.getUTCMonth(), today.getUTCDate()));
    this.status = this.payload.initialError ? 'error' : 'ready';
    this.errorMessage = this.payload.initialError;
    this.holidaysByYear.set(this.payload.initialYear, this.payload.initialHolidays);

    this.bindNodes();
    this.bindEvents();
    initFlowbite();
    this.setupParticles();
    this.render();
    this.startNextSummaryCountdown();
    void this.syncVisibleYears(false);
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
    this.destroyModal();
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.removeEventListener('resize', this.handleResize);
    cancelAnimationFrame(this.animationFrame);
    this.stopNextSummaryCountdown();
  }

  private readPayload(): HolidayAppPayload {
    const payloadNode = this.querySelector<HTMLScriptElement>('[data-app-payload]');

    if (!payloadNode?.textContent) {
      throw new Error('No se encontro el estado inicial de la aplicacion.');
    }

    return JSON.parse(payloadNode.textContent) as HolidayAppPayload;
  }

  private bindNodes(): void {
    this.periodLabel = this.querySelector<HTMLElement>('[data-period-label]')!;
    this.rangeLabel = this.querySelector<HTMLElement>('[data-range-label]')!;
    this.totalSummary = this.querySelector<HTMLElement>('[data-summary-total]');
    this.nextSummary = this.querySelector<HTMLElement>('[data-summary-next]')!;
    this.nextSummaryCountdown = this.querySelector<HTMLElement>('[data-summary-next-countdown]')!;
    this.nextSummaryStatus = this.querySelector<HTMLElement>('[data-summary-next-status]')!;
    this.nextSummaryDate = this.querySelector<HTMLElement>('[data-summary-next-date]')!;
    this.loadingOverlay = this.querySelector<HTMLElement>('[data-loading]')!;
    this.feedbackNode = this.querySelector<HTMLElement>('[data-feedback]')!;
    this.viewRoot = this.querySelector<HTMLElement>('[data-view-root]')!;
    this.installButton = this.querySelector<HTMLButtonElement>('[data-install]')!;
    this.refreshButton = this.querySelector<HTMLButtonElement>('[data-refresh]')!;
    this.mobileViewLabel = this.querySelector<HTMLElement>('[data-mobile-view-label]');
    this.modalTemplate = this.querySelector<HTMLTemplateElement>('[data-modal-template]')!;
    this.canvas = this.querySelector<HTMLCanvasElement>('[data-particle-canvas]') ?? document.createElement('canvas');
  }

  private ensureModal(): void {
    if (this.modalRoot) {
      return;
    }

    const fragment = this.modalTemplate.content.cloneNode(true) as DocumentFragment;
    const modalRoot = fragment.querySelector<HTMLElement>('#holiday-detail-modal');
    if (!modalRoot) {
      throw new Error('No se pudo crear el modal de festivos.');
    }

    document.body.appendChild(fragment);
    this.modalRoot = modalRoot;
    this.modalTitle = this.modalRoot.querySelector<HTMLElement>('[data-modal-title]');
    this.modalCountdown = this.modalRoot.querySelector<HTMLElement>('[data-modal-countdown]');
    this.modalDate = this.modalRoot.querySelector<HTMLElement>('[data-modal-date]');
    this.modalLocalName = this.modalRoot.querySelector<HTMLElement>('[data-modal-local-name]');
    this.modalName = this.modalRoot.querySelector<HTMLElement>('[data-modal-name]');
    this.modalTypes = this.modalRoot.querySelector<HTMLElement>('[data-modal-types]');
    this.modalList = this.modalRoot.querySelector<HTMLElement>('[data-modal-list]');
    this.modalScrollBody = this.modalRoot.querySelector<HTMLElement>('[data-modal-scroll]');

    this.modalRoot.querySelectorAll<HTMLElement>('[data-modal-close]').forEach((button) => {
      button.addEventListener('click', () => {
        this.modalInstance?.hide();
      });
    });

    this.modalInstance = new Modal(this.modalRoot, {
      placement: 'center',
      backdrop: 'dynamic',
      closable: true,
      onHide: () => {
        this.destroyModal();
      }
    });
  }

  private destroyModal(): void {
    this.modalRoot?.remove();
    this.modalInstance = null;
    this.modalRoot = null;
    this.activeHolidayDate = null;
    this.modalTitle = null;
    this.modalCountdown = null;
    this.modalDate = null;
    this.modalLocalName = null;
    this.modalName = null;
    this.modalTypes = null;
    this.modalList = null;
    this.modalScrollBody = null;
  }

  private bindEvents(): void {
    this.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', async () => {
        this.view = button.dataset.view as CalendarView;
        await this.syncVisibleYears(false);
      });
    });

    this.querySelectorAll<HTMLButtonElement>('[data-view-option]').forEach((button) => {
      button.addEventListener('click', async () => {
        this.view = button.dataset.viewOption as CalendarView;
        document.getElementById('view-dropdown-button')?.click();
        await this.syncVisibleYears(false);
      });
    });

    this.querySelector<HTMLButtonElement>('[data-prev]')?.addEventListener('click', async () => {
      this.focusDate = this.offsetFocus(-1);
      await this.syncVisibleYears(false);
    });

    this.querySelector<HTMLButtonElement>('[data-next]')?.addEventListener('click', async () => {
      this.focusDate = this.offsetFocus(1);
      await this.syncVisibleYears(false);
    });

    this.querySelector<HTMLButtonElement>('[data-today]')?.addEventListener('click', async () => {
      const today = todayDate();
      this.focusDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      await this.syncVisibleYears(false);
    });

    this.refreshButton.addEventListener('click', async () => {
      await this.syncVisibleYears(true);
    });

    this.feedbackNode.addEventListener('click', async (event) => {
      const target = event.target;

      if (target instanceof HTMLElement && target.dataset.feedbackAction === 'retry') {
        await this.syncVisibleYears(true);
      }
    });

    this.viewRoot.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLElement>('[data-holiday-open]');
      if (!button) {
        return;
      }

      const isoDate = button.dataset.holidayOpen;
      if (!isoDate) {
        return;
      }

      this.openHolidayModal(isoDate);
    });

    this.installButton.addEventListener('click', async () => {
      if (!this.installPromptEvent) {
        return;
      }

      await this.installPromptEvent.prompt();
      await this.installPromptEvent.userChoice;
      this.installPromptEvent = null;
      this.installButton.hidden = true;
    });

    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('resize', this.handleResize);
  }

  private handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent): void => {
    event.preventDefault();
    this.installPromptEvent = event;
    this.installButton.hidden = false;
  };

  private handleResize = (): void => {
    this.resizeCanvas();
  };

  private offsetFocus(step: number): Date {
    if (this.view === 'year') {
      return addYears(this.focusDate, step);
    }

    if (this.view === 'month') {
      return addMonths(this.focusDate, step);
    }

    return addDays(this.focusDate, step * 7);
  }

  private getVisibleYears(): number[] {
    if (this.view === 'year') {
      return [this.focusDate.getUTCFullYear()];
    }

    if (this.view === 'month') {
      return [this.focusDate.getUTCFullYear()];
    }

    const weekStart = startOfWeek(this.focusDate);
    return [...new Set([weekStart.getUTCFullYear(), addDays(weekStart, 6).getUTCFullYear()])];
  }

  private async syncVisibleYears(force: boolean): Promise<void> {
    const years = this.getVisibleYears();

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.status = 'loading';
    if (force) {
      years.forEach((year) => {
        this.holidaysByYear.delete(year);
        invalidateHolidayYear(year);
      });
    }
    this.render();

    try {
      const missingYears = years.filter((year) => !this.holidaysByYear.has(year));

      if (missingYears.length > 0) {
        const response = await fetchHolidayRange(missingYears, this.abortController.signal);
        response.forEach((holidays, year) => {
          this.holidaysByYear.set(year, holidays);
        });
      }

      this.status = 'ready';
      this.errorMessage = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      this.status = 'error';
      this.errorMessage = error instanceof Error ? error.message : 'No fue posible actualizar los festivos.';
    }

    this.render();
  }

  private render(): void {
    const activeYear = this.focusDate.getUTCFullYear();
    const activeHolidays = this.holidaysByYear.get(activeYear) ?? [];
    const combined = this.getVisibleYears().flatMap((year) => this.holidaysByYear.get(year) ?? []);
    const nextInYear = nextHoliday(activeHolidays, todayDate());

    if (this.totalSummary) {
      this.totalSummary.textContent = String(activeHolidays.length);
    }
    if (nextInYear) {
      const nextHolidayDate = parseIsoDate(nextInYear.date);
      this.nextSummaryHolidayIso = nextInYear.date;
      this.nextSummary.textContent = nextInYear.localName;
      this.nextSummaryDate.textContent = titleCase(fullDateLabel(nextHolidayDate));
      this.nextSummary.setAttribute('title', titleCase(fullDateLabel(nextHolidayDate)));
      this.updateNextSummaryCountdown();
    } else {
      this.nextSummaryHolidayIso = null;
      this.nextSummary.textContent = 'La API no reporta proximos eventos para este anio.';
      this.nextSummaryCountdown.textContent = 'Sin contador';
      this.nextSummaryStatus.hidden = true;
      this.nextSummaryDate.textContent = 'No hay fecha disponible';
      this.nextSummaryCountdown.classList.remove('is-today');
      this.nextSummary.removeAttribute('title');
    }

    this.loadingOverlay.hidden = this.status !== 'loading';
    this.refreshButton.disabled = this.status === 'loading';
    this.installButton.disabled = this.status === 'loading';

    this.renderLabels(combined);
    this.renderFeedback();
    this.renderView(combined);

    this.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      const isActive = button.dataset.view === this.view;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    this.querySelectorAll<HTMLButtonElement>('[data-view-option]').forEach((button) => {
      const isActive = button.dataset.viewOption === this.view;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    if (this.mobileViewLabel) {
      const viewLabels: Record<CalendarView, string> = {
        year: 'Vista anual',
        month: 'Vista mensual',
        week: 'Vista semanal'
      };
      this.mobileViewLabel.textContent = viewLabels[this.view];
    }
  }

  private renderLabels(holidays: HolidayItem[]): void {
    if (this.view === 'year') {
      this.periodLabel.textContent = String(this.focusDate.getUTCFullYear());
      this.rangeLabel.textContent = `${holidays.length} festivos distribuidos en 12 meses.`;
      return;
    }

    if (this.view === 'month') {
      this.periodLabel.textContent = titleCase(monthLabel(this.focusDate));
      this.rangeLabel.textContent = `${holidaysForMonth(
        holidays,
        this.focusDate.getUTCFullYear(),
        this.focusDate.getUTCMonth()
      ).length} festivos visibles en este mes.`;
      return;
    }

    this.periodLabel.textContent = `Semana ${weekLabel(this.focusDate)}`;
    this.rangeLabel.textContent = `${holidaysForWeek(holidays, this.focusDate).length} hitos en la semana activa.`;
  }

  private renderFeedback(): void {
    if (this.errorMessage) {
      this.feedbackNode.hidden = false;
      this.feedbackNode.innerHTML = `
        <div class="feedback-state__inner is-error">
          <p class="feedback-state__eyebrow">No pudimos refrescar el calendario</p>
          <h3>${escapeHtml(this.errorMessage)}</h3>
          <p>Verifica conexion o reintenta la consulta. Si habia datos previos, los conservamos en pantalla.</p>
          <button type="button" class="feedback-state__button" data-feedback-action="retry">Reintentar</button>
        </div>
      `;
      return;
    }

    this.feedbackNode.hidden = true;
    this.feedbackNode.innerHTML = '';
  }

  private renderView(holidays: HolidayItem[]): void {
    const holidayMap = groupHolidaysByDate(holidays);
    this.currentHolidayMap = holidayMap;

    if (this.view === 'year') {
      this.viewRoot.innerHTML = this.renderYearView(holidayMap);
      return;
    }

    if (this.view === 'month') {
      this.viewRoot.innerHTML = this.renderMonthView(holidays, holidayMap);
      return;
    }

    this.viewRoot.innerHTML = this.renderWeekView(holidays, holidayMap);
  }

  private renderYearView(holidayMap: Map<string, HolidayItem[]>): string {
    const year = this.focusDate.getUTCFullYear();

    return `
      <div class="year-grid">
        ${Array.from({ length: 12 }, (_, monthIndex) => {
          const monthDate = new Date(Date.UTC(year, monthIndex, 1));
          const cells = buildMonthGrid(year, monthIndex, holidayMap);

          return `
            <section class="calendar-card">
              <header class="calendar-card__header">
                <div>
                  <p class="calendar-card__eyebrow">${escapeHtml(titleCase(shortMonthLabel(monthDate)))}</p>
                </div>
                <span class="calendar-card__pill">${cells.filter((cell) => cell.holidays.length > 0).length} dias clave</span>
              </header>
              <div class="weekday-row">
                ${weekdayLabels()
                  .map((label) => `<span>${escapeHtml(label)}</span>`)
                  .join('')}
              </div>
              <div class="month-grid month-grid--compact">
                 ${cells.map((cell) => this.renderDayCell(cell, 'compact')).join('')}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderMonthView(holidays: HolidayItem[], holidayMap: Map<string, HolidayItem[]>): string {
    const year = this.focusDate.getUTCFullYear();
    const monthIndex = this.focusDate.getUTCMonth();
    const monthDate = new Date(Date.UTC(year, monthIndex, 1));
    const monthHolidays = holidaysForMonth(holidays, year, monthIndex);
    const cells = buildMonthGrid(year, monthIndex, holidayMap);

    return `
      <section class="calendar-card calendar-card--feature">
          <header class="calendar-card__header calendar-card__header--stacked">
            <div>
              <p class="calendar-card__eyebrow">Lectura mensual</p>
              <h3>${escapeHtml(titleCase(monthLabel(monthDate)))}</h3>
            </div>
            <p class="calendar-card__summary">${monthHolidays.length > 0 ? `${monthHolidays.length} festivos aparecen en esta ventana.` : 'Este mes no contiene festivos oficiales en la API.'}</p>
          </header>
          <div class="weekday-row weekday-row--large">
            ${weekdayLabels()
              .map((label) => `<span>${escapeHtml(label)}</span>`)
              .join('')}
          </div>
           <div class="month-grid month-grid--large">
              ${cells.map((cell) => this.renderDayCell(cell, 'month')).join('')}
          </div>
      </section>
    `;
  }

  private renderWeekView(holidays: HolidayItem[], holidayMap: Map<string, HolidayItem[]>): string {
    const weekStart = startOfWeek(this.focusDate);
    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const weekHolidays = holidaysForWeek(holidays, this.focusDate);

    return `
      <div class="week-layout">
        <section class="calendar-card calendar-card--feature">
          <header class="calendar-card__header calendar-card__header--stacked">
            <div>
              <p class="calendar-card__eyebrow">Secuencia semanal</p>
              <h3>${escapeHtml(weekLabel(this.focusDate))}</h3>
            </div>
            <p class="calendar-card__summary">Una lectura corta y precisa para planificar la semana alrededor de los dias oficiales.</p>
          </header>
          <div class="week-strip">
            ${weekDates
              .map((date) => {
                const isoDate = toIsoDate(date);
                const items = holidayMap.get(isoDate) ?? [];

                return `
                  <article class="week-day ${items.length > 0 ? 'week-day--holiday' : ''}">
                    <p class="week-day__eyebrow">${escapeHtml(titleCase(new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' }).format(date)))}</p>
                    <h4>${escapeHtml(fullDateLabel(date))}</h4>
                    ${
                      items.length > 0
                        ? `<button type="button" class="week-day__trigger" data-holiday-open="${escapeHtml(isoDate)}" aria-label="Abrir detalle del festivo ${escapeHtml(items[0].localName)}">
                            <span class="week-day__trigger-label">Ver detalle</span>
                          </button>`
                        : '<p class="week-day__empty">Sin festivos para este dia.</p>'
                    }
                  </article>
                `;
              })
              .join('')}
          </div>
        </section>

        <aside class="calendar-card calendar-card--aside">
          <header class="calendar-card__header calendar-card__header--stacked">
            <div>
              <p class="calendar-card__eyebrow">Resumen de la semana</p>
              <h3>Ritmo operativo</h3>
            </div>
            <p class="calendar-card__summary">Detecta bloques libres, descansos y ventanas para viajes.</p>
          </header>
          ${
            weekHolidays.length > 0
              ? `<div class="event-list">${weekHolidays
                  .map(
                    (holiday) => `
                      <article class="event-item">
                        <p class="event-item__date">${escapeHtml(titleCase(fullDateLabel(parseIsoDate(holiday.date))))}</p>
                        <h4>${escapeHtml(holiday.localName)}</h4>
                        <p>${escapeHtml(holiday.name)}</p>
                      </article>
                    `
                  )
                  .join('')}</div>`
              : this.renderEmptyState('Semana sin festivos', 'La vista semanal sigue siendo util para detectar continuidad laboral y programar desplazamientos.')
          }
        </aside>
      </div>
    `;
  }

  private renderDayCell(cell: { isoDate: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean; holidays: HolidayItem[] }, layout: CalendarDayCellLayout): string {
    return renderCalendarDayCell({
      isoDate: cell.isoDate,
      dayNumber: cell.dayNumber,
      isCurrentMonth: cell.isCurrentMonth,
      isToday: cell.isToday,
      holidays: cell.holidays,
      layout,
      holidayAriaLabel: this.dayCellAriaLabel(cell.isoDate, cell.holidays)
    });
  }

  private dayCellAriaLabel(isoDate: string, holidays: HolidayItem[]): string {
    const holidayNames = holidays.map((holiday) => holiday.localName).join(', ');
    return `${titleCase(fullDateLabel(parseIsoDate(isoDate)))}. ${holidayNames}`;
  }

  private startNextSummaryCountdown(): void {
    this.stopNextSummaryCountdown();
    this.nextSummaryIntervalId = window.setInterval(() => {
      this.updateNextSummaryCountdown();
    }, 1000);
  }

  private stopNextSummaryCountdown(): void {
    if (this.nextSummaryIntervalId !== null) {
      window.clearInterval(this.nextSummaryIntervalId);
      this.nextSummaryIntervalId = null;
    }
  }

  private updateNextSummaryCountdown(): void {
    if (!this.nextSummaryHolidayIso) {
      return;
    }

    if (this.nextSummaryHolidayIso === todayIsoDate()) {
      this.nextSummaryCountdown.textContent = '00:00:00:00';
      this.nextSummaryCountdown.classList.add('is-today');
      this.nextSummaryStatus.textContent = 'Hoy';
      this.nextSummaryStatus.hidden = false;
      return;
    }

    const remainingSeconds = this.remainingSecondsUntilHolidayStart(this.nextSummaryHolidayIso);
    this.nextSummaryCountdown.textContent = this.formatNextHolidayCountdown(remainingSeconds);
    this.nextSummaryCountdown.classList.remove('is-today');
    this.nextSummaryStatus.hidden = true;
  }

  private remainingSecondsUntilHolidayStart(holidayIsoDate: string): number {
    const targetMs = Date.parse(`${holidayIsoDate}T00:00:00-05:00`);

    if (Number.isNaN(targetMs)) {
      return 0;
    }

    const remainingMs = targetMs - Date.now();
    return Math.max(0, Math.floor(remainingMs / 1000));
  }

  private formatNextHolidayCountdown(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [days, hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }

  private openHolidayModal(isoDate: string): void {
    const holidays = this.currentHolidayMap.get(isoDate);
    if (!holidays || holidays.length === 0) {
      return;
    }

    this.ensureModal();

    const primaryHoliday = holidays[0];
    const holidayDate = parseIsoDate(primaryHoliday.date);

    this.modalTitle!.textContent = primaryHoliday.localName;
    this.modalDate!.textContent = titleCase(fullDateLabel(holidayDate));
    this.modalLocalName!.textContent = primaryHoliday.localName;
    this.modalName!.textContent = primaryHoliday.name;
    this.modalTypes!.innerHTML = holidays
      .flatMap((holiday) => holiday.types)
      .filter((type, index, all) => all.indexOf(type) === index)
      .map((type) => `<span class="holiday-pill">${escapeHtml(type)}</span>`)
      .join('');
    this.modalList!.innerHTML = holidays
      .map(
        (holiday) => `
          <article class="modal-detail-list__item">
            <strong>${escapeHtml(holiday.localName)}</strong>
            <span>${escapeHtml(holiday.name)}</span>
          </article>
        `
      )
      .join('');
    if (this.modalScrollBody) {
      this.modalScrollBody.scrollTop = 0;
    }

    this.activeHolidayDate = holidayDate;
    this.updateCountdownDisplay();

    this.modalInstance?.show();
  }

  private updateCountdownDisplay(): void {
    if (!this.activeHolidayDate) {
      return;
    }

    const todayIso = todayIsoDate();
    const holidayIso = toIsoDate(this.activeHolidayDate);

    if (holidayIso === todayIso) {
      this.modalCountdown!.textContent = 'Es hoy';
      this.modalDate!.textContent = `${titleCase(fullDateLabel(this.activeHolidayDate))} - Es hoy`;
      return;
    }

    const remainingMs = this.activeHolidayDate.getTime() - Date.now();

    if (remainingMs <= 0) {
      this.modalCountdown!.textContent = 'Ya paso';
      this.modalDate!.textContent = `${titleCase(fullDateLabel(this.activeHolidayDate))} - Ya paso`;
      return;
    }

    const days = Math.ceil(remainingMs / 86400000);
    this.modalCountdown!.textContent = days === 1 ? 'Falta 1 dia' : `Faltan ${days} dias`;
    this.modalDate!.textContent = titleCase(fullDateLabel(this.activeHolidayDate));
  }

  private renderEmptyState(title: string, description: string): string {
    return `
      <div class="empty-state">
        <p class="empty-state__eyebrow">Estado vacio</p>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  private setupParticles(): void {
    if (!this.canvas.isConnected) {
      return;
    }

    this.resizeCanvas();
    const count = Math.min(Math.floor(window.innerWidth / 48), 34);
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      radius: Math.random() * 1.8 + 0.8,
      alpha: Math.random() * 0.45 + 0.12
    }));

    const context = this.canvas.getContext('2d');
    if (!context) {
      return;
    }

    const tick = () => {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > this.canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > this.canvas.height) particle.vy *= -1;

        context.beginPath();
        context.fillStyle = `rgba(197, 168, 128, ${particle.alpha})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });

      this.animationFrame = window.requestAnimationFrame(tick);
    };

    tick();
  }

  private resizeCanvas(): void {
    if (!this.canvas.isConnected) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * ratio;
    this.canvas.height = window.innerHeight * ratio;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    const context = this.canvas.getContext('2d');
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

if (!customElements.get('holiday-calendar-app')) {
  customElements.define('holiday-calendar-app', HolidayCalendarAppElement);
}
